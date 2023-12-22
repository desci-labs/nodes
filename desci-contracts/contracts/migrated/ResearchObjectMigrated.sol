//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./MigrationTools.sol";
import "../IDpidRegistry.sol";
import "../ResearchObjectV2.sol";
import "../DpidRegistry.sol";

contract ResearchObjectMigrated is ResearchObjectV2 {
    event VersionPushMigrated(
        address indexed _from,
        uint256 indexed _uuid,
        bytes _cid,
        uint256 _migration_timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address dpidRegistry,
        MigrationData[] memory importData,
        bytes32 defaultPrefix
    ) public initializer {
        ResearchObjectV2.__ResearchObjectV2_init(dpidRegistry);

        OwnableUpgradeable.__Ownable_init();

        _dpidRegistry = dpidRegistry;

        for (uint256 i = 0; i < importData.length; i++) {
            MigrationData memory data = importData[i];
            _importWithDpid(
                data.uuid,
                data.cid,
                defaultPrefix,
                data.dpid,
                data.timestamp,
                data.from
            );
        }
    }

    function _importWithDpid(
        uint256 uuid,
        bytes memory cid,
        bytes32 prefix,
        uint256 expectedDpid,
        uint256 timestamp,
        address targetAccount
    ) private onlyInitializing {
        IDpidRegistry registry = IDpidRegistry(_dpidRegistry);

        uint256 target = registry.get(prefix, expectedDpid);

        address to = targetAccount;
        uint256 tokenId = uuid;

        if (target == 0) {
            uint256 dpid = registry.put{value: msg.value}(prefix, uuid);
            require(expectedDpid == dpid, "Unexpected dPID");
            _safeMint(to, tokenId);
            // approve caller to manage updates for import process
            _approve(_msgSender(), tokenId);
        }
        updateMetadata(uuid, cid);
        emit VersionPushMigrated(to, tokenId, cid, timestamp);
    }
}
