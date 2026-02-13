// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SentinelCCIPSender - Sends cross-chain pause commands via Chainlink CCIP
/// @notice Deployed on the source chain. When a critical threat is detected,
///         the sentinel backend calls sendPauseCommand() to pause vaults on remote chains.
contract SentinelCCIPSender is Ownable {

    IRouterClient private immutable i_router;
    IERC20 private immutable i_linkToken;

    /// @notice Emitted when a cross-chain pause command is sent
    event CrossChainPauseSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receiver,
        uint256 fees
    );

    /// @notice Emitted when LINK tokens are withdrawn
    event LinkWithdrawn(address indexed to, uint256 amount);

    error NotEnoughLinkBalance(uint256 currentBalance, uint256 calculatedFees);
    error InvalidReceiver();

    constructor(address _router, address _linkToken) Ownable(msg.sender) {
        i_router = IRouterClient(_router);
        i_linkToken = IERC20(_linkToken);
    }

    /// @notice Send a pause command to a receiver contract on a destination chain via CCIP
    /// @param destinationChainSelector The CCIP chain selector for the destination chain
    /// @param receiver The address of the SentinelCCIPReceiver on the destination chain
    /// @return messageId The CCIP message ID
    function sendPauseCommand(
        uint64 destinationChainSelector,
        address receiver
    ) external onlyOwner returns (bytes32 messageId) {
        if (receiver == address(0)) revert InvalidReceiver();

        // Encode the pause command
        bytes memory data = abi.encode("PAUSE");

        // Build the CCIP message
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({
                    gasLimit: 200_000,
                    allowOutOfOrderExecution: true
                })
            ),
            feeToken: address(i_linkToken)
        });

        // Get the fee
        uint256 fees = i_router.getFee(destinationChainSelector, message);

        uint256 linkBalance = i_linkToken.balanceOf(address(this));
        if (fees > linkBalance) {
            revert NotEnoughLinkBalance(linkBalance, fees);
        }

        // Approve the router to spend LINK
        i_linkToken.approve(address(i_router), fees);

        // Send the CCIP message
        messageId = i_router.ccipSend(destinationChainSelector, message);

        emit CrossChainPauseSent(messageId, destinationChainSelector, receiver, fees);

        return messageId;
    }

    /// @notice Get the estimated fee for sending a pause command
    /// @param destinationChainSelector The CCIP chain selector
    /// @param receiver The receiver address on the destination chain
    /// @return fee The estimated fee in LINK
    function estimatePauseFee(
        uint64 destinationChainSelector,
        address receiver
    ) external view returns (uint256 fee) {
        bytes memory data = abi.encode("PAUSE");

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({
                    gasLimit: 200_000,
                    allowOutOfOrderExecution: true
                })
            ),
            feeToken: address(i_linkToken)
        });

        return i_router.getFee(destinationChainSelector, message);
    }

    /// @notice Withdraw LINK tokens from the contract (owner only)
    function withdrawLink(address to) external onlyOwner {
        uint256 balance = i_linkToken.balanceOf(address(this));
        i_linkToken.transfer(to, balance);
        emit LinkWithdrawn(to, balance);
    }

    /// @notice Get the LINK balance of this contract
    function getLinkBalance() external view returns (uint256) {
        return i_linkToken.balanceOf(address(this));
    }
}
