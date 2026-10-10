// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IERC4907} from "./interfaces/IERC4907.sol";

interface IEscrowLock {
    function isLocked(uint256 tokenId) external view returns (bool);
}

/// @title RentalItem
/// @notice One ERC-721 per listed item, plus an ERC-4907 user right that expires on its own.
///         The UI calls this a "Bukti Sewa". Only the escrow may set the user.
contract RentalItem is ERC721, ERC721URIStorage, IERC4907 {
    struct Terms {
        uint256 valueIDR;
        uint256 ratePerDay;
        uint256 lateFeePerHour;
        uint32 graceHours;
    }

    address public admin;
    address public escrow;
    uint256 public nextId = 1;

    mapping(uint256 tokenId => Terms) private _terms;
    mapping(uint256 tokenId => uint16) public depositFloorBps;
    mapping(uint256 tokenId => address) private _users;
    mapping(uint256 tokenId => uint64) private _expires;

    event Listed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 valueIDR,
        uint256 ratePerDay,
        uint256 lateFeePerHour,
        uint32 graceHours,
        string metadataURI
    );
    event DepositFloorSet(uint256 indexed tokenId, uint16 floorBps);

    error NotAdmin();
    error NotEscrow();
    error EscrowAlreadySet();
    error InvalidTerms();
    error ZeroAddress();
    error TransferLocked();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() ERC721("Rentra Item", "RENTRA") {
        admin = msg.sender;
    }

    /// @notice One-time wire-up. Only the deployer can point the collection at the escrow.
    function setEscrow(address escrow_) external onlyAdmin {
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (escrow_ == address(0)) revert ZeroAddress();
        escrow = escrow_;
    }

    /// @notice Mint a listed item to the caller. Base deposit equals `valueIDR` before reputation.
    function listItem(
        string calldata metadataURI,
        uint256 valueIDR,
        uint256 ratePerDay,
        uint256 lateFeePerHour,
        uint32 graceHours
    ) external returns (uint256 tokenId) {
        return _listItem(metadataURI, valueIDR, ratePerDay, lateFeePerHour, graceHours, 10_000);
    }

    /// @notice The owner explicitly accepts the uncovered exposure below the item's value.
    function listItem(
        string calldata metadataURI,
        uint256 valueIDR,
        uint256 ratePerDay,
        uint256 lateFeePerHour,
        uint32 graceHours,
        uint16 floorBps
    ) external returns (uint256 tokenId) {
        if (floorBps < 3_000 || floorBps > 10_000) revert InvalidTerms();
        return _listItem(metadataURI, valueIDR, ratePerDay, lateFeePerHour, graceHours, floorBps);
    }

    function _listItem(
        string calldata metadataURI,
        uint256 valueIDR,
        uint256 ratePerDay,
        uint256 lateFeePerHour,
        uint32 graceHours,
        uint16 floorBps
    ) internal returns (uint256 tokenId) {
        if (valueIDR == 0 || ratePerDay == 0) revert InvalidTerms();
        tokenId = nextId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);
        _terms[tokenId] =
            Terms({valueIDR: valueIDR, ratePerDay: ratePerDay, lateFeePerHour: lateFeePerHour, graceHours: graceHours});
        depositFloorBps[tokenId] = floorBps;
        emit DepositFloorSet(tokenId, floorBps);
        emit Listed(tokenId, msg.sender, valueIDR, ratePerDay, lateFeePerHour, graceHours, metadataURI);
    }

    function terms(uint256 tokenId)
        external
        view
        returns (uint256 valueIDR, uint256 ratePerDay, uint256 lateFeePerHour, uint32 graceHours)
    {
        _requireOwned(tokenId);
        Terms memory t = _terms[tokenId];
        return (t.valueIDR, t.ratePerDay, t.lateFeePerHour, t.graceHours);
    }

    /// @inheritdoc IERC4907
    function setUser(uint256 tokenId, address user, uint64 expires) external {
        if (msg.sender != escrow) revert NotEscrow();
        _requireOwned(tokenId);
        _users[tokenId] = user;
        _expires[tokenId] = expires;
        emit UpdateUser(tokenId, user, expires);
    }

    /// @inheritdoc IERC4907
    /// @dev Returns address(0) once `block.timestamp` passes `expires` (standard ERC-4907).
    function userOf(uint256 tokenId) public view returns (address) {
        if (uint256(_expires[tokenId]) >= block.timestamp) {
            return _users[tokenId];
        }
        return address(0);
    }

    /// @inheritdoc IERC4907
    function userExpires(uint256 tokenId) public view returns (uint256) {
        return _expires[tokenId];
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            if (userOf(tokenId) != address(0)) revert TransferLocked();
            if (escrow != address(0) && IEscrowLock(escrow).isLocked(tokenId)) revert TransferLocked();
        }
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return interfaceId == type(IERC4907).interfaceId || super.supportsInterface(interfaceId);
    }
}
