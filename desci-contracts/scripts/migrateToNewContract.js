/**
 * Migrate dpid registry + researchobject states from another network/contract to a new target network/contract
 *
 * Uses existing graph index to migrate the data
 *
 * In production, ensure the source contract is paused BEFORE running this, to ensure no new data is added during/after the migration
 *
 * In production, the import can only be run once
 *
 * To keep previous event log times, we will migrate the timestamps as a new field in the event added to DpidRegistryV2
 */
