// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ERC-4907 rentable NFT (user right that expires automatically)
/// @dev https://eips.ethereum.org/EIPS/eip-4907
interface IERC4907 {
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);

    function setUser(uint256 tokenId, address user, uint64 expires) external;

    function userOf(uint256 tokenId) external view returns (address);

    function userExpires(uint256 tokenId) external view returns (uint256);
}
