//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract DpidAliasRegistry is OwnableUpgradeable {
    uint256 public _firstDpid;
    uint256 public nextDpid;

    // dpid => codex streamID
    mapping(uint256 => string) public registry;


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __DpidAliasRegistry_init(uint256 firstDpid) public initializer {
        OwnableUpgradeable.__Ownable_init();
        firstDpid = firstDpid;
        nextDpid = firstDpid;
    }

    /**
     * Lookup the codex stream ID of a given dPID
     * @param dpid the alias to lookup
     */
    function lookup(uint256 dpid) public view returns(string memory) {
        return registry[dpid];
    }

    event DpidMinted (
        uint256 dpid,
        string streamID
    );

    /**
     * Claim the next free dPID by pointing it to a codex stream ID
     * 
     * @param streamId the codex stream ID to alias
     */
    function mintDpid(string calldata streamId) public returns(uint256) { 
        uint256 thisDpid = nextDpid;
        registry[thisDpid] = streamId;

        emit DpidMinted(thisDpid, streamId);
        
        nextDpid++;
        return thisDpid;
    }

    // ---------------------- //
    // Backward compatibility //
    // ---------------------- //

    struct LegacyVersion {
        string cid;
        uint256 timestamp;
    }

    struct LegacyDpidEntry {
        address owner;
        LegacyVersion[] versions;
    }

    /**
     * Maps dPIDs before _firstDpid to it's complete history.
     * This allows resolving every old state of a legacy dPID
     * using only this contract. If the author wants to update
     * this history, they need to call migrateDpid.
     */ 
    mapping(uint256 => LegacyDpidEntry) public legacy;

    /**
     * Lookup the token ID of an unmigrated, legacy dPID.
     * Use this to 
     * @param dpid the alias to lookup
     */
    function legacyLookup(uint256 dpid) public view returns(LegacyDpidEntry memory) {
        return legacy[dpid];
    }

    event UpgradedDpid (
        uint256 dpid,
        string streamId
    );

    /**
     * The owner of a migrated ResearchObject token can call this function
     * to claim the same dPID in this alias registry by pointing it to a codex
     * streamID representing the same research object.
     * 
     * This is an at-most-once operation, as the registry is immutable.
     * The caller must make sure the stream represents the same history,
     * and that it controls the stream.
     * 
     * The legacy entry is deleted when migrated.
     * 
     * @param dpid the dPID to migrate
     * @param streamId the codex stream ID that shall supersede the legacy history
     */
    function upgradeDpid(uint256 dpid, string calldata streamId) public {
        // Assert that this dPID has not been set in the main registry
        require(bytes(registry[dpid]).length == 0, "dpid already upgraded");
        // Assert that the tx was made by the owner of the imported entry
        require(legacy[dpid].owner == tx.origin, "unauthorized dpid upgrade");

        // Reclaim old dpid
        registry[dpid] = streamId;

        emit UpgradedDpid(dpid, streamId);

        // Delete the legacy entry ?
        // delete legacy[dpid];
    }

    // ---------------------------- //
    // Population of legacy mapping //
    // ---------------------------- //

    event ImportedDpid (
        uint256 dpid,
        LegacyDpidEntry entry
    );

    function importLegacyDpid(uint256 dpid, LegacyDpidEntry calldata entry) public onlyOwner {
        legacy[dpid] = entry;
        emit ImportedDpid(dpid, entry);
    }
}
