// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IProtectedVault {
    function emergencyPause() external;
}

/// @title SentinelCCIPReceiver - Receives cross-chain pause commands via Chainlink CCIP
/// @notice Deployed on each destination chain. When a CCIP message arrives from an
///         authorized sender, it calls emergencyPause() on the local ProtectedVault.
contract SentinelCCIPReceiver is CCIPReceiver, Ownable {

    /// @notice The vault this receiver protects
    address public vault;

    /// @notice Authorized source chain selector
    uint64 public allowedSourceChainSelector;

    /// @notice Authorized sender address on the source chain
    address public allowedSender;

    /// @notice Emitted when a cross-chain pause command is received and executed
    event CrossChainPauseReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address sender
    );

    /// @notice Emitted when the vault is updated
    event VaultUpdated(address indexed oldVault, address indexed newVault);

    error UnauthorizedSourceChain(uint64 sourceChainSelector);
    error UnauthorizedSender(address sender);
    error InvalidVault();

    constructor(
        address _router,
        address _vault,
        uint64 _allowedSourceChainSelector,
        address _allowedSender
    ) CCIPReceiver(_router) Ownable(msg.sender) {
        vault = _vault;
        allowedSourceChainSelector = _allowedSourceChainSelector;
        allowedSender = _allowedSender;
    }

    /// @notice CCIP callback — called by the Router when a message arrives
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        uint64 sourceChainSelector = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));

        // Verify the message comes from the authorized source
        if (sourceChainSelector != allowedSourceChainSelector) {
            revert UnauthorizedSourceChain(sourceChainSelector);
        }
        if (sender != allowedSender) {
            revert UnauthorizedSender(sender);
        }

        // Decode the command
        string memory command = abi.decode(message.data, (string));

        // Execute the pause command
        if (keccak256(bytes(command)) == keccak256(bytes("PAUSE"))) {
            IProtectedVault(vault).emergencyPause();
        }

        emit CrossChainPauseReceived(
            message.messageId,
            sourceChainSelector,
            sender
        );
    }

    /// @notice Update the vault address (owner only)
    function setVault(address _vault) external onlyOwner {
        if (_vault == address(0)) revert InvalidVault();
        address oldVault = vault;
        vault = _vault;
        emit VaultUpdated(oldVault, _vault);
    }

    /// @notice Update the allowed source chain and sender (owner only)
    function setAllowedSource(
        uint64 _chainSelector,
        address _sender
    ) external onlyOwner {
        allowedSourceChainSelector = _chainSelector;
        allowedSender = _sender;
    }
}
