//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./VersionedERC721V2.sol";
import "./IDpidRegistry.sol";

contract ResearchObjectV2 is VersionedERC721V2, OwnableUpgradeable {
    string private _uri;

    address public _dpidRegistry;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __ResearchObjectV2_init(address dpidRegistry) public initializer {
        VersionedERC721V2.__VersionedERC721V2_init(
            "DeSci Research Object",
            "DeSci-Node"
        );
        OwnableUpgradeable.__Ownable_init();
        _dpidRegistry = dpidRegistry;
    }

    function _beforeTokenTransfer(
        address _from,
        address,
        uint256
    ) internal pure override {
        require(_from == address(0), "no transfer");
    }

    /** Minting */
    function mint(uint256 uuid, bytes calldata cid) public {
        address to = _msgSender();
        uint256 tokenId = uuid;
        _safeMint(to, tokenId);
        updateMetadata(uuid, cid);
    }

    function mintWithDpid(
        uint256 uuid,
        bytes calldata cid,
        bytes32 prefix,
        uint256 expectedDpid
    ) public payable {
        IDpidRegistry registry = IDpidRegistry(_dpidRegistry);

        uint256 dpid = registry.put{value: msg.value}(prefix, uuid);
        require(expectedDpid == dpid, "Unexpected dPID");
        mint(uuid, cid);
    }

    function _baseURI() internal view override returns (string memory) {
        return _uri;
    }

    function setURI(string memory uri) public onlyOwner {
        _uri = uri;
    }

    function setRegistry(address dpidRegistry) public onlyOwner {
        _dpidRegistry = dpidRegistry;
    }
}
