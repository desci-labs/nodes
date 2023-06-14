/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type { TestERC721, TestERC721Interface } from "../TestERC721";

const _abi = [
  {
    inputs: [
      {
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        internalType: "string",
        name: "symbol",
        type: "string",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "approved",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    name: "ApprovalForAll",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "getApproved",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
    ],
    name: "isApprovedForAll",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "ownerOf",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "tokenURI",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x608060405260006006553480156200001657600080fd5b5060405162002cad38038062002cad83398181016040528101906200003c9190620001ff565b818181600090816200004f9190620004cf565b508060019081620000619190620004cf565b5050505050620005b6565b6000604051905090565b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b620000d5826200008a565b810181811067ffffffffffffffff82111715620000f757620000f66200009b565b5b80604052505050565b60006200010c6200006c565b90506200011a8282620000ca565b919050565b600067ffffffffffffffff8211156200013d576200013c6200009b565b5b62000148826200008a565b9050602081019050919050565b60005b838110156200017557808201518184015260208101905062000158565b60008484015250505050565b60006200019862000192846200011f565b62000100565b905082815260208101848484011115620001b757620001b662000085565b5b620001c484828562000155565b509392505050565b600082601f830112620001e457620001e362000080565b5b8151620001f684826020860162000181565b91505092915050565b6000806040838503121562000219576200021862000076565b5b600083015167ffffffffffffffff8111156200023a57620002396200007b565b5b6200024885828601620001cc565b925050602083015167ffffffffffffffff8111156200026c576200026b6200007b565b5b6200027a85828601620001cc565b9150509250929050565b600081519050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b60006002820490506001821680620002d757607f821691505b602082108103620002ed57620002ec6200028f565b5b50919050565b60008190508160005260206000209050919050565b60006020601f8301049050919050565b600082821b905092915050565b600060088302620003577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8262000318565b62000363868362000318565b95508019841693508086168417925050509392505050565b6000819050919050565b6000819050919050565b6000620003b0620003aa620003a4846200037b565b62000385565b6200037b565b9050919050565b6000819050919050565b620003cc836200038f565b620003e4620003db82620003b7565b84845462000325565b825550505050565b600090565b620003fb620003ec565b62000408818484620003c1565b505050565b5b81811015620004305762000424600082620003f1565b6001810190506200040e565b5050565b601f8211156200047f576200044981620002f3565b620004548462000308565b8101602085101562000464578190505b6200047c620004738562000308565b8301826200040d565b50505b505050565b600082821c905092915050565b6000620004a46000198460080262000484565b1980831691505092915050565b6000620004bf838362000491565b9150826002028217905092915050565b620004da8262000284565b67ffffffffffffffff811115620004f657620004f56200009b565b5b620005028254620002be565b6200050f82828562000434565b600060209050601f83116001811462000547576000841562000532578287015190505b6200053e8582620004b1565b865550620005ae565b601f1984166200055786620002f3565b60005b8281101562000581578489015182556001820191506020850194506020810190506200055a565b86831015620005a157848901516200059d601f89168262000491565b8355505b6001600288020188555050505b505050505050565b6126e780620005c66000396000f3fe608060405234801561001057600080fd5b50600436106100ea5760003560e01c80636a6278421161008c578063a22cb46511610066578063a22cb4651461025b578063b88d4fde14610277578063c87b56dd14610293578063e985e9c5146102c3576100ea565b80636a627842146101f157806370a082311461020d57806395d89b411461023d576100ea565b8063095ea7b3116100c8578063095ea7b31461016d57806323b872dd1461018957806342842e0e146101a55780636352211e146101c1576100ea565b806301ffc9a7146100ef57806306fdde031461011f578063081812fc1461013d575b600080fd5b61010960048036038101906101049190611904565b6102f3565b604051610116919061194c565b60405180910390f35b6101276103d5565b60405161013491906119f7565b60405180910390f35b61015760048036038101906101529190611a4f565b610467565b6040516101649190611abd565b60405180910390f35b61018760048036038101906101829190611b04565b6104ad565b005b6101a3600480360381019061019e9190611b44565b6105c4565b005b6101bf60048036038101906101ba9190611b44565b610624565b005b6101db60048036038101906101d69190611a4f565b610644565b6040516101e89190611abd565b60405180910390f35b61020b60048036038101906102069190611b97565b6106ca565b005b61022760048036038101906102229190611b97565b6106ed565b6040516102349190611bd3565b60405180910390f35b6102456107a4565b60405161025291906119f7565b60405180910390f35b61027560048036038101906102709190611c1a565b610836565b005b610291600480360381019061028c9190611d8f565b61084c565b005b6102ad60048036038101906102a89190611a4f565b6108ae565b6040516102ba91906119f7565b60405180910390f35b6102dd60048036038101906102d89190611e12565b610916565b6040516102ea919061194c565b60405180910390f35b60007f80ac58cd000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff191614806103be57507f5b5e139f000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916145b806103ce57506103cd826109aa565b5b9050919050565b6060600080546103e490611e81565b80601f016020809104026020016040519081016040528092919081815260200182805461041090611e81565b801561045d5780601f106104325761010080835404028352916020019161045d565b820191906000526020600020905b81548152906001019060200180831161044057829003601f168201915b5050505050905090565b600061047282610a14565b6004600083815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050919050565b60006104b882610644565b90508073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610528576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161051f90611f24565b60405180910390fd5b8073ffffffffffffffffffffffffffffffffffffffff16610547610a5f565b73ffffffffffffffffffffffffffffffffffffffff161480610576575061057581610570610a5f565b610916565b5b6105b5576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105ac90611fb6565b60405180910390fd5b6105bf8383610a67565b505050565b6105d56105cf610a5f565b82610b20565b610614576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161060b90612048565b60405180910390fd5b61061f838383610bb5565b505050565b61063f8383836040518060200160405280600081525061084c565b505050565b60008061065083610eae565b9050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16036106c1576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016106b8906120b4565b60405180910390fd5b80915050919050565b6106ea81600660008154809291906106e190612103565b91905055610eeb565b50565b60008073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff160361075d576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610754906121bd565b60405180910390fd5b600360008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b6060600180546107b390611e81565b80601f01602080910402602001604051908101604052809291908181526020018280546107df90611e81565b801561082c5780601f106108015761010080835404028352916020019161082c565b820191906000526020600020905b81548152906001019060200180831161080f57829003601f168201915b5050505050905090565b610848610841610a5f565b8383610f09565b5050565b61085d610857610a5f565b83610b20565b61089c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161089390612048565b60405180910390fd5b6108a884848484611075565b50505050565b60606108b982610a14565b60006108c36110d1565b905060008151116108e3576040518060200160405280600081525061090e565b806108ed846110e8565b6040516020016108fe929190612219565b6040516020818303038152906040525b915050919050565b6000600560008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff16905092915050565b60007f01ffc9a7000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916149050919050565b610a1d816111b6565b610a5c576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a53906120b4565b60405180910390fd5b50565b600033905090565b816004600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff16610ada83610644565b73ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92560405160405180910390a45050565b600080610b2c83610644565b90508073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff161480610b6e5750610b6d8185610916565b5b80610bac57508373ffffffffffffffffffffffffffffffffffffffff16610b9484610467565b73ffffffffffffffffffffffffffffffffffffffff16145b91505092915050565b8273ffffffffffffffffffffffffffffffffffffffff16610bd582610644565b73ffffffffffffffffffffffffffffffffffffffff1614610c2b576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c22906122af565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603610c9a576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c9190612341565b60405180910390fd5b610ca783838360016111f7565b8273ffffffffffffffffffffffffffffffffffffffff16610cc782610644565b73ffffffffffffffffffffffffffffffffffffffff1614610d1d576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610d14906122af565b60405180910390fd5b6004600082815260200190815260200160002060006101000a81549073ffffffffffffffffffffffffffffffffffffffff02191690556001600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055506001600360008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282540192505081905550816002600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60405160405180910390a4610ea9838383600161131d565b505050565b60006002600083815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050919050565b610f05828260405180602001604052806000815250611323565b5050565b8173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610f77576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610f6e906123ad565b60405180910390fd5b80600560008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff0219169083151502179055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c3183604051611068919061194c565b60405180910390a3505050565b611080848484610bb5565b61108c8484848461137e565b6110cb576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016110c29061243f565b60405180910390fd5b50505050565b606060405180602001604052806000815250905090565b6060600060016110f784611505565b01905060008167ffffffffffffffff81111561111657611115611c64565b5b6040519080825280601f01601f1916602001820160405280156111485781602001600182028036833780820191505090505b509050600082602001820190505b6001156111ab578080600190039150507f3031323334353637383961626364656600000000000000000000000000000000600a86061a8153600a858161119f5761119e61245f565b5b04945060008503611156575b819350505050919050565b60008073ffffffffffffffffffffffffffffffffffffffff166111d883610eae565b73ffffffffffffffffffffffffffffffffffffffff1614159050919050565b600181111561131757600073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff161461128b5780600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254611283919061248e565b925050819055505b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff16146113165780600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825461130e91906124c2565b925050819055505b5b50505050565b50505050565b61132d8383611658565b61133a600084848461137e565b611379576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016113709061243f565b60405180910390fd5b505050565b600061139f8473ffffffffffffffffffffffffffffffffffffffff16611875565b156114f8578373ffffffffffffffffffffffffffffffffffffffff1663150b7a026113c8610a5f565b8786866040518563ffffffff1660e01b81526004016113ea949392919061254b565b6020604051808303816000875af192505050801561142657506040513d601f19601f8201168201806040525081019061142391906125ac565b60015b6114a8573d8060008114611456576040519150601f19603f3d011682016040523d82523d6000602084013e61145b565b606091505b5060008151036114a0576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016114979061243f565b60405180910390fd5b805181602001fd5b63150b7a0260e01b7bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916817bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916149150506114fd565b600190505b949350505050565b600080600090507a184f03e93ff9f4daa797ed6e38ed64bf6a1f0100000000000000008310611563577a184f03e93ff9f4daa797ed6e38ed64bf6a1f01000000000000000083816115595761155861245f565b5b0492506040810190505b6d04ee2d6d415b85acef810000000083106115a0576d04ee2d6d415b85acef810000000083816115965761159561245f565b5b0492506020810190505b662386f26fc1000083106115cf57662386f26fc1000083816115c5576115c461245f565b5b0492506010810190505b6305f5e10083106115f8576305f5e10083816115ee576115ed61245f565b5b0492506008810190505b612710831061161d5761271083816116135761161261245f565b5b0492506004810190505b6064831061164057606483816116365761163561245f565b5b0492506002810190505b600a831061164f576001810190505b80915050919050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff16036116c7576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016116be90612625565b60405180910390fd5b6116d0816111b6565b15611710576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161170790612691565b60405180910390fd5b61171e6000838360016111f7565b611727816111b6565b15611767576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161175e90612691565b60405180910390fd5b6001600360008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282540192505081905550816002600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60405160405180910390a461187160008383600161131d565b5050565b6000808273ffffffffffffffffffffffffffffffffffffffff163b119050919050565b6000604051905090565b600080fd5b600080fd5b60007fffffffff0000000000000000000000000000000000000000000000000000000082169050919050565b6118e1816118ac565b81146118ec57600080fd5b50565b6000813590506118fe816118d8565b92915050565b60006020828403121561191a576119196118a2565b5b6000611928848285016118ef565b91505092915050565b60008115159050919050565b61194681611931565b82525050565b6000602082019050611961600083018461193d565b92915050565b600081519050919050565b600082825260208201905092915050565b60005b838110156119a1578082015181840152602081019050611986565b60008484015250505050565b6000601f19601f8301169050919050565b60006119c982611967565b6119d38185611972565b93506119e3818560208601611983565b6119ec816119ad565b840191505092915050565b60006020820190508181036000830152611a1181846119be565b905092915050565b6000819050919050565b611a2c81611a19565b8114611a3757600080fd5b50565b600081359050611a4981611a23565b92915050565b600060208284031215611a6557611a646118a2565b5b6000611a7384828501611a3a565b91505092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000611aa782611a7c565b9050919050565b611ab781611a9c565b82525050565b6000602082019050611ad26000830184611aae565b92915050565b611ae181611a9c565b8114611aec57600080fd5b50565b600081359050611afe81611ad8565b92915050565b60008060408385031215611b1b57611b1a6118a2565b5b6000611b2985828601611aef565b9250506020611b3a85828601611a3a565b9150509250929050565b600080600060608486031215611b5d57611b5c6118a2565b5b6000611b6b86828701611aef565b9350506020611b7c86828701611aef565b9250506040611b8d86828701611a3a565b9150509250925092565b600060208284031215611bad57611bac6118a2565b5b6000611bbb84828501611aef565b91505092915050565b611bcd81611a19565b82525050565b6000602082019050611be86000830184611bc4565b92915050565b611bf781611931565b8114611c0257600080fd5b50565b600081359050611c1481611bee565b92915050565b60008060408385031215611c3157611c306118a2565b5b6000611c3f85828601611aef565b9250506020611c5085828601611c05565b9150509250929050565b600080fd5b600080fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b611c9c826119ad565b810181811067ffffffffffffffff82111715611cbb57611cba611c64565b5b80604052505050565b6000611cce611898565b9050611cda8282611c93565b919050565b600067ffffffffffffffff821115611cfa57611cf9611c64565b5b611d03826119ad565b9050602081019050919050565b82818337600083830152505050565b6000611d32611d2d84611cdf565b611cc4565b905082815260208101848484011115611d4e57611d4d611c5f565b5b611d59848285611d10565b509392505050565b600082601f830112611d7657611d75611c5a565b5b8135611d86848260208601611d1f565b91505092915050565b60008060008060808587031215611da957611da86118a2565b5b6000611db787828801611aef565b9450506020611dc887828801611aef565b9350506040611dd987828801611a3a565b925050606085013567ffffffffffffffff811115611dfa57611df96118a7565b5b611e0687828801611d61565b91505092959194509250565b60008060408385031215611e2957611e286118a2565b5b6000611e3785828601611aef565b9250506020611e4885828601611aef565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b60006002820490506001821680611e9957607f821691505b602082108103611eac57611eab611e52565b5b50919050565b7f4552433732313a20617070726f76616c20746f2063757272656e74206f776e6560008201527f7200000000000000000000000000000000000000000000000000000000000000602082015250565b6000611f0e602183611972565b9150611f1982611eb2565b604082019050919050565b60006020820190508181036000830152611f3d81611f01565b9050919050565b7f4552433732313a20617070726f76652063616c6c6572206973206e6f7420746f60008201527f6b656e206f776e6572206f7220617070726f76656420666f7220616c6c000000602082015250565b6000611fa0603d83611972565b9150611fab82611f44565b604082019050919050565b60006020820190508181036000830152611fcf81611f93565b9050919050565b7f4552433732313a2063616c6c6572206973206e6f7420746f6b656e206f776e6560008201527f72206f7220617070726f76656400000000000000000000000000000000000000602082015250565b6000612032602d83611972565b915061203d82611fd6565b604082019050919050565b6000602082019050818103600083015261206181612025565b9050919050565b7f4552433732313a20696e76616c696420746f6b656e2049440000000000000000600082015250565b600061209e601883611972565b91506120a982612068565b602082019050919050565b600060208201905081810360008301526120cd81612091565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b600061210e82611a19565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036121405761213f6120d4565b5b600182019050919050565b7f4552433732313a2061646472657373207a65726f206973206e6f74206120766160008201527f6c6964206f776e65720000000000000000000000000000000000000000000000602082015250565b60006121a7602983611972565b91506121b28261214b565b604082019050919050565b600060208201905081810360008301526121d68161219a565b9050919050565b600081905092915050565b60006121f382611967565b6121fd81856121dd565b935061220d818560208601611983565b80840191505092915050565b600061222582856121e8565b915061223182846121e8565b91508190509392505050565b7f4552433732313a207472616e736665722066726f6d20696e636f72726563742060008201527f6f776e6572000000000000000000000000000000000000000000000000000000602082015250565b6000612299602583611972565b91506122a48261223d565b604082019050919050565b600060208201905081810360008301526122c88161228c565b9050919050565b7f4552433732313a207472616e7366657220746f20746865207a65726f2061646460008201527f7265737300000000000000000000000000000000000000000000000000000000602082015250565b600061232b602483611972565b9150612336826122cf565b604082019050919050565b6000602082019050818103600083015261235a8161231e565b9050919050565b7f4552433732313a20617070726f766520746f2063616c6c657200000000000000600082015250565b6000612397601983611972565b91506123a282612361565b602082019050919050565b600060208201905081810360008301526123c68161238a565b9050919050565b7f4552433732313a207472616e7366657220746f206e6f6e20455243373231526560008201527f63656976657220696d706c656d656e7465720000000000000000000000000000602082015250565b6000612429603283611972565b9150612434826123cd565b604082019050919050565b600060208201905081810360008301526124588161241c565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b600061249982611a19565b91506124a483611a19565b92508282039050818111156124bc576124bb6120d4565b5b92915050565b60006124cd82611a19565b91506124d883611a19565b92508282019050808211156124f0576124ef6120d4565b5b92915050565b600081519050919050565b600082825260208201905092915050565b600061251d826124f6565b6125278185612501565b9350612537818560208601611983565b612540816119ad565b840191505092915050565b60006080820190506125606000830187611aae565b61256d6020830186611aae565b61257a6040830185611bc4565b818103606083015261258c8184612512565b905095945050505050565b6000815190506125a6816118d8565b92915050565b6000602082840312156125c2576125c16118a2565b5b60006125d084828501612597565b91505092915050565b7f4552433732313a206d696e7420746f20746865207a65726f2061646472657373600082015250565b600061260f602083611972565b915061261a826125d9565b602082019050919050565b6000602082019050818103600083015261263e81612602565b9050919050565b7f4552433732313a20746f6b656e20616c7265616479206d696e74656400000000600082015250565b600061267b601c83611972565b915061268682612645565b602082019050919050565b600060208201905081810360008301526126aa8161266e565b905091905056fea26469706673582212203d4b4c60bec87b6665fb7ff2b17db58cdb8f5b7d803f6f43f6e63b89d4af421364736f6c63430008110033";

type TestERC721ConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: TestERC721ConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class TestERC721__factory extends ContractFactory {
  constructor(...args: TestERC721ConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
    this.contractName = "TestERC721";
  }

  deploy(
    name: string,
    symbol: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<TestERC721> {
    return super.deploy(name, symbol, overrides || {}) as Promise<TestERC721>;
  }
  getDeployTransaction(
    name: string,
    symbol: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(name, symbol, overrides || {});
  }
  attach(address: string): TestERC721 {
    return super.attach(address) as TestERC721;
  }
  connect(signer: Signer): TestERC721__factory {
    return super.connect(signer) as TestERC721__factory;
  }
  static readonly contractName: "TestERC721";
  public readonly contractName: "TestERC721";
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): TestERC721Interface {
    return new utils.Interface(_abi) as TestERC721Interface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): TestERC721 {
    return new Contract(address, _abi, signerOrProvider) as TestERC721;
  }
}
