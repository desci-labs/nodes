//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract DpidAliasRegistry is OwnableUpgradeable {
    // Only written at time of initialization
    uint256 public firstDpid;

    // Incremented on each dPID mint
    uint256 public nextDpid;

    // dpid => codex streamID (resolve dPID)
    mapping(uint256 => string) public registry;

    // codex streamID => dpid (check for existing aliases)
    mapping(string => uint256) public reverseRegistry;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __DpidAliasRegistry_init(uint256 _firstDpid) public initializer {
        OwnableUpgradeable.__Ownable_init();
        firstDpid = _firstDpid;
        nextDpid = _firstDpid;
    }

    /**
     * Resolve the codex stream ID of a given dPID
     * @param dpid the alias to resolve
     */
    function resolve(uint256 dpid) public view returns(string memory) {
        return registry[dpid];
    }

    /**
     * Find the dPID of a given codex stream ID, if it exists
     * @param streamId the codex stream ID to search for
     */
    function find(string calldata streamId) public view returns(uint256) {
        return reverseRegistry[streamId];
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
        require(reverseRegistry[streamId] == 0, "stream already has a dPID");

        uint256 thisDpid = nextDpid;

        // map this dPID to the passed stream ID
        registry[thisDpid] = streamId;

        // map the passed stream ID to this dPID
        reverseRegistry[streamId] = thisDpid;

        emit DpidMinted(thisDpid, streamId);

        // Move counter to next free dPID
        nextDpid++;
        return thisDpid;
    }

    // ---------------------- //
    // Backward compatibility //
    // ---------------------- //

    struct LegacyVersion {
        string cid;
        uint256 time;
    }

    struct LegacyDpidEntry {
        address owner;
        LegacyVersion[] versions;
    }

    /**
     * Maps dPIDs before _firstDpid to it's complete history.
     * This allows resolving every old state of a legacy dPID
     * using only this contract. If the author wants to update
     * this history, they need to call upgradeDpid.
     */
    mapping(uint256 => LegacyDpidEntry) public legacy;

    /**
     * Lookup the state of an unmigrated, legacy dPID.
     * Use this to resolve the history of a dPID that hasn't been updated
     * since the protocol upgrade, or to check the timestamps of old versions.
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

        // ???????????????????????????????????????????????????
        // Assert that this stream hasn't already got an alias
        require(reverseRegistry[streamId] == 0, "stream already has a dPID");

        // Assert that the tx was made by the owner of the imported entry
        require(legacy[dpid].owner == msg.sender, "unauthorized dpid upgrade");

        // Reclaim old dpid
        registry[dpid] = streamId;
        reverseRegistry[streamId] = dpid;

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
