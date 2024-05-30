//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract DpidAliasRegistry is OwnableUpgradeable {
    // Starting point of new aliases (set at initialization)
    uint256 public firstDpid;

    // Incremented on each dPID mint
    uint256 public nextDpid;

    // When this is set to true, further edits of the legacy entries are blocked
    bool public migrationFrozen;

    // dpid => codex streamID (resolve dPID)
    mapping(uint256 => string) public registry;

    // codex streamID => dpid (check for existing aliases)
    mapping(string => uint256) public reverseRegistry;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _firstDpid) public initializer {
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

    /**
     * Signal that a stream has been bound to a new dPID alias.
     *
     * @param dpid the new alias
     * @param streamID the bound stream
     */
    event DpidMinted (
        uint256 dpid,
        string streamID
    );

    /**
     * Ensure the streamId to alias is not already bound to a dPID.
     *
     * @param streamId the stream that is requesting a dPID
     */
    modifier onlyUnaliasedStream(string calldata streamId) {
        require(reverseRegistry[streamId] == 0, "stream already has a dPID");
        _;
    }

    /**
     * Claim the next free dPID by pointing it to a codex stream ID.
     * This can only be done once, as a given steam can only have one dPID.
     *
     * @param streamId the codex stream ID to alias
     */
    function mintDpid(
        string calldata streamId
    ) public onlyUnaliasedStream(streamId) returns(uint256) {
        uint256 thisDpid = nextDpid;

        // map this dPID to the passed stream ID
        registry[thisDpid] = streamId;

        // map the passed stream ID to this dPID
        reverseRegistry[streamId] = thisDpid;

        emit DpidMinted(thisDpid, streamId);

        // Move counter to a free dPID
        nextDpid++;
        return thisDpid;
    }

    // ---------------------- //
    // Backward compatibility //
    // ---------------------- //

    /**
     * Represents a single update in the history of a legacy dPID
     */
    struct LegacyVersion {
        string cid;
        uint256 time;
    }

    /**
     * Represents the entire lineage of a legacy dPID, associated with it's owner.
     * This owner information is what gates the upgrade of a dPID.
     */
    struct LegacyDpidEntry {
        address owner;
        LegacyVersion[] versions;
    }

    /**
     * Maps legacy dPIDs to their complete history.
     * This allows resolving every old state of a legacy dPID
     * using only this contract. If the author wants to update
     * this history, they need to call upgradeDpid.
     *
     * This mapping stays populated even after a dPID is upgraded,
     * to allow finding the timestamps for previous versions if needed.
     * Additionally, if the stream that claims the dPID as an alias
     * does not represent the same history, this allows falling back
     * to resolving the historical state regardless.
     */
    mapping(uint256 => LegacyDpidEntry) public legacy;

    /**
     * Lookup the state of an unmigrated, legacy dPID.
     * Use this to resolve the history of a dPID that hasn't been updated
     * since the protocol upgrade, or to check the timestamps of old versions.
     *
     * @param dpid the alias to lookup
     */
    function legacyLookup(uint256 dpid) public view returns(LegacyDpidEntry memory) {
        return legacy[dpid];
    }

    /**
     * Signal that a legacy dPID has been upgraded and bound to a stream.
     *
     * @param dpid the dPID which has been upgraded
     * @param streamId the bound stream
     */
    event UpgradedDpid (
        uint256 dpid,
        string streamId
    );

    /**
     * The owner of a legacy dPID can call this function to claim the same dPID
     * in this alias registry, by pointing it to a codex stream.
     *
     * This function can only be called with a stream that hasn't already
     * minted an alias, as each stream only can have one dPID.
     *
     * This is an at-most-once operation, as the registry is immutable.
     * The caller must make sure the stream represents the same history,
     * and that it controls the stream. This cannot be formally guaranteed,
     * which is why the legacy entires are kept to ensure continued deterministic
     * resolution of versions as they were originally created.
     *
     * @param dpid the dPID to upgrade
     * @param streamId the stream representing that same dPID
     */
    function upgradeDpid(
        uint256 dpid,
        string calldata streamId
    ) public onlyUnaliasedStream(streamId) {
        // Assert that this dPID has not been set in the main registry
        require(bytes(registry[dpid]).length == 0, "dpid already upgraded");

        // Assert that the tx was made by the owner of the imported entry
        require(legacy[dpid].owner == msg.sender, "unauthorized dpid upgrade");

        // Reclaim old dpid
        registry[dpid] = streamId;
        reverseRegistry[streamId] = dpid;

        emit UpgradedDpid(dpid, streamId);
    }

    // ---------------------------- //
    // Population of legacy mapping //
    // ---------------------------- //

    /**
     * Signal that a legacy dPID has been imported into the legacy registry.
     *
     * @param dpid the imported dPID
     * @param entry the historical information to store
     */
    event ImportedDpid (
        uint256 dpid,
        LegacyDpidEntry entry
    );

    /**
     * Import the history and ownership information about a legacy dPID into
     * the registry. This allows overwriting to correct migration errors,
     * but can be locked for further imports.
     *
     * @param dpid the dPID to import
     * @param entry the historical and ownership information
     */
    function importLegacyDpid(
        uint256 dpid,
        LegacyDpidEntry calldata entry
    ) public onlyOwner {
        require(migrationFrozen == false, "migration is frozen");
        legacy[dpid] = entry;
        emit ImportedDpid(dpid, entry);
    }

    /**
     * This permanently blocks importing/overwriting legacy dPID entries,
     * effectively freezing history.
     */
    function freezeMigration() public onlyOwner {
        migrationFrozen = true;
    }
}
