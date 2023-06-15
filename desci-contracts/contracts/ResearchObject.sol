//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./VersionedERC721.sol";
import "./IDpidRegistry.sol";
// import "./metatx/ERC2771RecipientUpgradeable.sol";
import "@opengsn/contracts/src/ERC2771Recipient.sol";

contract ResearchObject is
    VersionedERC721,
    OwnableUpgradeable,
    ERC2771Recipient
{
    string private _uri;

    address public _dpidRegistry;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address dpidRegistry,
        address forwarder
    ) public initializer {
        VersionedERC721.__VersionedERC721_init(
            "DeSci Research Object",
            "DeSci-Node"
        );
        OwnableUpgradeable.__Ownable_init();
        _dpidRegistry = dpidRegistry;
        _setTrustedForwarder(forwarder);
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

    /// @inheritdoc ERC2771Recipient
    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771Recipient)
        returns (address ret)
    {
        if (msg.data.length >= 20 && isTrustedForwarder(msg.sender)) {
            // At this point we know that the sender is a trusted forwarder,
            // so we trust that the last bytes of msg.data are the verified sender address.
            // extract sender address from the end of msg.data
            assembly {
                ret := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            ret = msg.sender;
        }
    }

    /// @inheritdoc ERC2771Recipient
    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771Recipient)
        returns (bytes calldata ret)
    {
        if (msg.data.length >= 20 && isTrustedForwarder(msg.sender)) {
            return msg.data[0:msg.data.length - 20];
        } else {
            return msg.data;
        }
    }
}
