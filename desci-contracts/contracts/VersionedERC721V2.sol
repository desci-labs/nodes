//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract VersionedERC721V2 is Initializable, ERC721Upgradeable {
    mapping(uint256 => bytes) public _metadata;

    event VersionPush(address indexed _from, uint256 indexed _uuid, bytes _cid);

    function __VersionedERC721V2_init(
        string memory name,
        string memory symbol
    ) public onlyInitializing {
        ERC721Upgradeable.__ERC721_init(name, symbol);
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    // The owner can add Metadata, but never remove it
    function updateMetadata(
        uint256 tokenId,
        bytes memory cid
    ) public onlyHolder(tokenId) {
        _metadata[tokenId] = cid;
        emit VersionPush(_msgSender(), tokenId, cid);
    }

    modifier onlyHolder(uint256 tokenId) {
        address sender = _msgSender();
        bool auth = ownerOf(tokenId) == sender ||
            _isApprovedOrOwner(sender, tokenId);
        require(auth, "No permission");
        _;
    }
}
