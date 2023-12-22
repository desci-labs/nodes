// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

struct MigrationData {
    address from;
    uint256 uuid;
    bytes cid;
    uint256 timestamp;
    uint256 dpid;
}
