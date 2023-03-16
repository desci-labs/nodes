//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./IDpidRegistry.sol";

/**
 * dpid.org / dpid.eth Registry
 *
 * Store incrementing uint256 -> arbitrary uint256, scoped by org
 *
 */
contract DpidRegistry is OwnableUpgradeable, IDpidRegistry {
    event Register(bytes32 prefix, uint256 entryId);
    event RegisterOrganization(
        bytes32 prefix,
        address registrant,
        address[] tokenGate
    );
    event UpdateOrganization(
        bytes32 prefix,
        address registrant,
        address[] tokenGate
    );

    struct Organization {
        bytes32 prefix;
        address registrant;
        address[] tokenGate; // addresses of token for gating, if size > 0, 1 must be present in registrant's balance
        mapping(uint256 => uint256) entries;
        uint256 count;
    }

    mapping(bytes32 => Organization) public organizations;

    // spam-prevent/sustainability fee for dpid resolver
    uint256 _fee;

    // spam-prevent/registration fee for org prefix
    uint256 _orgFee;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        _fee = 500000 gwei;
        _orgFee = 0.5 ether;
        address[] memory DEFAULT_BLANK = new address[](0);
        __registerOrg("", DEFAULT_BLANK);
        __registerOrg("dpid", DEFAULT_BLANK);
        __registerOrg("dcite", DEFAULT_BLANK);
        __registerOrg("dev", DEFAULT_BLANK);
        __registerOrg("stage", DEFAULT_BLANK);
        __registerOrg("beta", DEFAULT_BLANK);
        __registerOrg("desci", DEFAULT_BLANK);
        __registerOrg("node", DEFAULT_BLANK);
        __registerOrg("nodes", DEFAULT_BLANK);
        __registerOrg("doi", DEFAULT_BLANK);
        __registerOrg("a", DEFAULT_BLANK);
        __registerOrg("d", DEFAULT_BLANK);
        __registerOrg("x", DEFAULT_BLANK);
        __registerOrg("z", DEFAULT_BLANK);
        OwnableUpgradeable.__Ownable_init();
    }

    function registerOrgWithGate(bytes32 prefix, address[] memory tokenGate)
        public
        payable
    {
        require(msg.value >= _orgFee, "Fee required");
        require(validateCharacters(prefix), "Invalid prefix");

        __registerOrg(prefix, tokenGate);
    }

    function registerOrg(bytes32 prefix) public payable {
        registerOrgWithGate(prefix, new address[](0));
    }

    /// Internal function to register an org
    /// @param prefix org prefix string
    /// @param tokenGate an ERC721 address collection to check before allowing registrations, if empty, skip check
    function __registerOrg(bytes32 prefix, address[] memory tokenGate)
        internal
    {
        require(
            organizations[prefix].prefix == 0 &&
                organizations[prefix].registrant == address(0),
            "Prefix taken"
        );
        Organization storage newOrg = organizations[prefix];
        newOrg.registrant = _msgSender();
        newOrg.prefix = prefix;
        newOrg.tokenGate = tokenGate;
        emit RegisterOrganization(prefix, _msgSender(), tokenGate);
    }

    /// Update org token gate
    /// @param prefix org prefix string
    /// @param tokenGate an ERC721 address collection to check before allowing registrations, if empty, skip check
    function updateOrg(bytes32 prefix, address[] memory tokenGate)
        public
        onlyOrganizationOwner(prefix)
    {
        Organization storage existingOrg = organizations[prefix];
        existingOrg.tokenGate = tokenGate;
        emit UpdateOrganization(prefix, _msgSender(), tokenGate);
    }

    // add to registry
    function put(bytes32 prefix, uint256 entry)
        public
        payable
        override
        returns (uint256)
    {
        require(msg.value >= _fee, "Fee required");
        require(organizations[prefix].prefix == prefix, "Invalid prefix");

        Organization storage target = organizations[prefix];

        // if token gate is nonempty, ensure at least 1 of the specified token is in sender's balance
        if (target.tokenGate.length > 0) {
            uint256 gateLen = target.tokenGate.length;
            bool found = false;
            for (uint256 i = 0; i < gateLen; ) {
                ERC721 targetTokenGate = ERC721(target.tokenGate[i]);
                if (targetTokenGate.balanceOf(_msgSender()) > 0) {
                    found = true;
                    break;
                }

                unchecked {
                    ++i;
                }
            }
            require(found, "Unauthorized: Token gate");
        }

        uint256 index = target.count;
        target.entries[index] = entry;
        emit Register(prefix, index);
        target.count++;

        return index;
    }

    function get(bytes32 prefix, uint256 entryId)
        public
        view
        override
        returns (uint256)
    {
        require(organizations[prefix].prefix == prefix, "Invalid prefix");

        Organization storage target = organizations[prefix];
        return target.entries[entryId];
    }

    function getOrganization(bytes32 prefix)
        public
        view
        override
        returns (uint256, address)
    {
        require(organizations[prefix].prefix == prefix, "Invalid prefix");
        Organization storage target = organizations[prefix];
        return (target.count, target.registrant);
    }

    function exists(bytes32 prefix, uint256 entryId)
        public
        view
        returns (bool)
    {
        require(organizations[prefix].prefix == prefix, "Invalid prefix");

        Organization storage target = organizations[prefix];
        return entryId < target.count;
    }

    function getFee() public view returns (uint256) {
        return _fee;
    }

    function setFee(uint256 gweiFee) public onlyOwner {
        _fee = gweiFee;
    }

    function getOrgFee() public view returns (uint256) {
        return _orgFee;
    }

    function setOrgFee(uint256 gweiFee) public onlyOwner {
        _orgFee = gweiFee;
    }

    function withdraw() public onlyOwner {
        address payable to = payable(owner());
        to.transfer(address(this).balance);
    }

    /// Ensure lowercase allowed list of characters
    /// @param prefix the string to check
    /// @return valid or not
    function validateCharacters(bytes32 prefix)
        public
        pure
        returns (bool valid)
    {
        uint256 allowedChars = 0;
        uint256 length = 0;
        bytes memory allowed = bytes("abcdefghijklmnopqrstuvwxyz0123456789-_.");
        for (uint256 i = 0; i < prefix.length; i++) {
            if (prefix[i] == 0) {
                length = i;
                break;
            }
            for (uint256 j = 0; j < allowed.length; j++) {
                if (prefix[i] == allowed[j]) {
                    allowedChars++;
                    break;
                }
            }
        }
        if (allowedChars < length) {
            return false;
        }
        return true;
    }

    function stringToBytes32(string memory source)
        public
        pure
        returns (bytes32 result)
    {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(source, 32))
        }
    }

    modifier onlyOrganizationOwner(bytes32 prefix) {
        require(
            organizations[prefix].registrant == _msgSender(),
            "Only owner updates"
        );
        _;
    }
}
