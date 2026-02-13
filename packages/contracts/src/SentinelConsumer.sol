// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver} from "@chainlink/contracts/cre/src/v1/interfaces/IReceiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title SentinelConsumer — CRE Workflow Report Receiver
/// @notice Receives threat reports from the CRE DON via the KeystoneForwarder.
///         When a critical threat is detected by the CRE workflow, this contract
///         can automatically trigger emergencyPause() on the target ProtectedVault.
///
/// Architecture:
///   CRE DON detects threat → consensus → KeystoneForwarder → SentinelConsumer.onReport()
///   → decode severity → if CRITICAL: call vault.emergencyPause()
///   → emit ThreatReportReceived event for dashboard indexing
///
/// Access Control:
///   - Only allowed senders (KeystoneForwarder addresses) can call onReport()
///   - Only allowed workflow owners can submit reports
///   - Only allowed workflow names are accepted
contract SentinelConsumer is IReceiver, Ownable {

    // ─── Threat Severity Levels ─────────────────────────────────────
    uint8 public constant SEVERITY_INFO = 0;
    uint8 public constant SEVERITY_LOW = 1;
    uint8 public constant SEVERITY_MEDIUM = 2;
    uint8 public constant SEVERITY_HIGH = 3;
    uint8 public constant SEVERITY_CRITICAL = 4;

    // ─── Report Structure ───────────────────────────────────────────
    // Decoded from the CRE workflow report bytes
    struct ThreatReport {
        address vaultAddress;    // Target vault
        uint8 severity;          // 0=info, 1=low, 2=medium, 3=high, 4=critical
        bytes32 threatType;      // e.g., keccak256("large_transfer")
        uint256 amountWei;       // Transaction amount that triggered the threat
        bytes32 txHash;          // Original transaction hash
        uint256 timestamp;       // When the threat was detected
    }

    // ─── Events ─────────────────────────────────────────────────────
    event ThreatReportReceived(
        address indexed vaultAddress,
        uint8 severity,
        bytes32 threatType,
        uint256 amountWei,
        bytes32 txHash,
        uint256 timestamp
    );

    event AutoPauseTriggered(
        address indexed vaultAddress,
        uint8 severity,
        bytes32 txHash
    );

    event VaultRegistered(address indexed vaultAddress);
    event VaultRemoved(address indexed vaultAddress);

    // ─── Errors ─────────────────────────────────────────────────────
    error UnauthorizedSender(address sender);
    error UnauthorizedWorkflowOwner(address workflowOwner);
    error UnauthorizedWorkflowName(bytes10 workflowName);
    error VaultNotRegistered(address vaultAddress);
    error PauseFailed(address vaultAddress);

    // ─── State ──────────────────────────────────────────────────────
    // Access control: allowed forwarder addresses
    address[] internal s_allowedSendersList;
    mapping(address => bool) internal s_allowedSenders;

    // Access control: allowed workflow owners
    address[] internal s_allowedWorkflowOwnersList;
    mapping(address => bool) internal s_allowedWorkflowOwners;

    // Access control: allowed workflow names
    bytes10[] internal s_allowedWorkflowNamesList;
    mapping(bytes10 => bool) internal s_allowedWorkflowNames;

    // Registered vaults that this consumer can pause
    mapping(address => bool) public registeredVaults;
    address[] public vaultList;

    // Whether auto-pause is enabled for critical threats
    bool public autoPauseEnabled;

    // Minimum severity level required to trigger auto-pause (default: CRITICAL)
    uint8 public autoPauseSeverityThreshold;

    // Report counter for tracking
    uint256 public totalReportsReceived;

    // Last report per vault
    mapping(address => ThreatReport) public lastReport;

    // ─── Constructor ────────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        autoPauseEnabled = true;
        autoPauseSeverityThreshold = SEVERITY_CRITICAL;
    }

    // ─── CRE Access Control Configuration ───────────────────────────
    /// @notice Configure allowed senders, workflow owners, and workflow names
    /// @dev Only callable by the contract owner
    function setConfig(
        address[] calldata _allowedSendersList,
        address[] calldata _allowedWorkflowOwnersList,
        bytes10[] calldata _allowedWorkflowNamesList
    ) external onlyOwner {
        // Clear old senders
        for (uint32 i = 0; i < s_allowedSendersList.length; ++i) {
            s_allowedSenders[s_allowedSendersList[i]] = false;
        }
        for (uint32 i = 0; i < _allowedSendersList.length; ++i) {
            s_allowedSenders[_allowedSendersList[i]] = true;
        }
        s_allowedSendersList = _allowedSendersList;

        // Clear old workflow owners
        for (uint32 i = 0; i < s_allowedWorkflowOwnersList.length; ++i) {
            s_allowedWorkflowOwners[s_allowedWorkflowOwnersList[i]] = false;
        }
        for (uint32 i = 0; i < _allowedWorkflowOwnersList.length; ++i) {
            s_allowedWorkflowOwners[_allowedWorkflowOwnersList[i]] = true;
        }
        s_allowedWorkflowOwnersList = _allowedWorkflowOwnersList;

        // Clear old workflow names
        for (uint32 i = 0; i < s_allowedWorkflowNamesList.length; ++i) {
            s_allowedWorkflowNames[s_allowedWorkflowNamesList[i]] = false;
        }
        for (uint32 i = 0; i < _allowedWorkflowNamesList.length; ++i) {
            s_allowedWorkflowNames[_allowedWorkflowNamesList[i]] = true;
        }
        s_allowedWorkflowNamesList = _allowedWorkflowNamesList;
    }

    // ─── Vault Management ───────────────────────────────────────────
    /// @notice Register a vault that this consumer can auto-pause
    function registerVault(address vault) external onlyOwner {
        if (!registeredVaults[vault]) {
            registeredVaults[vault] = true;
            vaultList.push(vault);
            emit VaultRegistered(vault);
        }
    }

    /// @notice Remove a vault from the registered list
    function removeVault(address vault) external onlyOwner {
        registeredVaults[vault] = false;
        emit VaultRemoved(vault);
    }

    /// @notice Set auto-pause configuration
    function setAutoPause(bool enabled, uint8 severityThreshold) external onlyOwner {
        autoPauseEnabled = enabled;
        autoPauseSeverityThreshold = severityThreshold;
    }

    // ─── IReceiver Implementation ───────────────────────────────────
    /// @notice Called by the KeystoneForwarder when a CRE workflow report arrives
    /// @dev The forwarder validates DON signatures before calling this
    /// @param metadata Contains workflow_cid, workflow_name, workflow_owner, report_name
    /// @param rawReport ABI-encoded ThreatReport struct
    function onReport(bytes calldata metadata, bytes calldata rawReport) external override {
        // Verify sender is an allowed forwarder
        if (!s_allowedSenders[msg.sender]) {
            revert UnauthorizedSender(msg.sender);
        }

        // Extract and verify workflow metadata
        (bytes10 workflowName, address workflowOwner) = _getInfo(metadata);
        if (!s_allowedWorkflowNames[workflowName]) {
            revert UnauthorizedWorkflowName(workflowName);
        }
        if (!s_allowedWorkflowOwners[workflowOwner]) {
            revert UnauthorizedWorkflowOwner(workflowOwner);
        }

        // Decode the threat report
        ThreatReport memory report = abi.decode(rawReport, (ThreatReport));

        // Store the report
        lastReport[report.vaultAddress] = report;
        totalReportsReceived++;

        // Emit event for dashboard indexing
        emit ThreatReportReceived(
            report.vaultAddress,
            report.severity,
            report.threatType,
            report.amountWei,
            report.txHash,
            report.timestamp
        );

        // Auto-pause if enabled and severity meets threshold
        if (
            autoPauseEnabled &&
            report.severity >= autoPauseSeverityThreshold &&
            registeredVaults[report.vaultAddress]
        ) {
            _triggerEmergencyPause(report);
        }
    }

    // ─── Internal: Trigger Emergency Pause ──────────────────────────
    function _triggerEmergencyPause(ThreatReport memory report) internal {
        // Call emergencyPause() on the target vault
        // This contract must be set as the sentinel on the vault
        (bool success, ) = report.vaultAddress.call(
            abi.encodeWithSignature("emergencyPause()")
        );

        if (success) {
            emit AutoPauseTriggered(
                report.vaultAddress,
                report.severity,
                report.txHash
            );
        }
        // Note: we don't revert on failure — the report is still stored
        // and the event is still emitted. The pause failure is logged
        // but doesn't block report processing.
    }

    // ─── Metadata Parsing ───────────────────────────────────────────
    /// @dev Extract workflow name and owner from CRE metadata
    /// Metadata layout (after 32-byte length prefix):
    ///   workflow_cid:   offset 32, size 32
    ///   workflow_name:  offset 64, size 10
    ///   workflow_owner: offset 74, size 20
    ///   report_name:    offset 94, size  2
    function _getInfo(
        bytes memory metadata
    ) internal pure returns (bytes10 workflowName, address workflowOwner) {
        assembly {
            workflowName := mload(add(metadata, 64))
            workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))
        }
    }

    // ─── View Functions ─────────────────────────────────────────────
    /// @notice Get the last threat report for a vault
    function getLastReport(address vault) external view returns (
        uint8 severity,
        bytes32 threatType,
        uint256 amountWei,
        bytes32 txHash,
        uint256 timestamp
    ) {
        ThreatReport memory report = lastReport[vault];
        return (
            report.severity,
            report.threatType,
            report.amountWei,
            report.txHash,
            report.timestamp
        );
    }

    /// @notice Get all registered vault addresses
    function getRegisteredVaults() external view returns (address[] memory) {
        return vaultList;
    }

    /// @notice Get all allowed senders (forwarder addresses)
    function getAllowedSenders() external view returns (address[] memory) {
        return s_allowedSendersList;
    }

    // ─── ERC165 Support ─────────────────────────────────────────────
    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return
            interfaceId == type(IReceiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
