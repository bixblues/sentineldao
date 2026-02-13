// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ProtectedVault - A vault contract protected by SentinelDAO
/// @notice This vault can be paused by the Sentinel system when threats are detected
contract ProtectedVault is Pausable, Ownable, ReentrancyGuard {
    
    /// @notice Role for the Sentinel system to pause the vault
    address public sentinel;
    
    /// @notice Emitted when ETH is deposited
    event Deposit(address indexed from, uint256 amount);
    
    /// @notice Emitted when ETH is withdrawn
    event Withdrawal(address indexed to, uint256 amount);
    
    /// @notice Emitted when the sentinel address is updated
    event SentinelUpdated(address indexed oldSentinel, address indexed newSentinel);
    
    /// @notice Emitted when the vault is paused by sentinel
    event EmergencyPause(address indexed triggeredBy, uint256 timestamp);
    
    error OnlySentinel();
    error TransferFailed();
    error ZeroAmount();
    
    constructor(address _sentinel) Ownable(msg.sender) {
        sentinel = _sentinel;
    }
    
    modifier onlySentinel() {
        if (msg.sender != sentinel && msg.sender != owner()) {
            revert OnlySentinel();
        }
        _;
    }
    
    /// @notice Deposit ETH into the vault
    function deposit() external payable whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposit(msg.sender, msg.value);
    }
    
    /// @notice Withdraw ETH from the vault (owner only)
    function withdraw(uint256 amount) external onlyOwner whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > address(this).balance) revert TransferFailed();
        
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        emit Withdrawal(msg.sender, amount);
    }
    
    /// @notice Emergency pause - can be called by sentinel or owner
    function emergencyPause() external onlySentinel {
        _pause();
        emit EmergencyPause(msg.sender, block.timestamp);
    }
    
    /// @notice Unpause the vault (owner only)
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /// @notice Update the sentinel address
    function setSentinel(address _sentinel) external onlyOwner {
        address oldSentinel = sentinel;
        sentinel = _sentinel;
        emit SentinelUpdated(oldSentinel, _sentinel);
    }
    
    /// @notice Get the vault balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /// @notice Allow receiving ETH directly
    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }
}
