"use strict";
/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
exports.__esModule = true;
exports.ContextUpgradeable__factory = void 0;
var ethers_1 = require("ethers");
var _abi = [
    {
        anonymous: false,
        inputs: [
            {
                indexed: false,
                internalType: "uint8",
                name: "version",
                type: "uint8"
            },
        ],
        name: "Initialized",
        type: "event"
    },
];
var ContextUpgradeable__factory = /** @class */ (function () {
    function ContextUpgradeable__factory() {
    }
    ContextUpgradeable__factory.createInterface = function () {
        return new ethers_1.utils.Interface(_abi);
    };
    ContextUpgradeable__factory.connect = function (address, signerOrProvider) {
        return new ethers_1.Contract(address, _abi, signerOrProvider);
    };
    ContextUpgradeable__factory.abi = _abi;
    return ContextUpgradeable__factory;
}());
exports.ContextUpgradeable__factory = ContextUpgradeable__factory;
