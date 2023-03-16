//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDpidRegistry {
    function put(bytes32 prefix, uint256 entry)
        external
        payable
        returns (uint256);

    function get(bytes32 prefix, uint256 entryId)
        external
        view
        returns (uint256);

    function getOrganization(bytes32 prefix)
        external
        view
        returns (uint256, address);
}
