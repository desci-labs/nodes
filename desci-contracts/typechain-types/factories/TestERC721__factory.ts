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
  "0x608060405260006006553480156200001657600080fd5b5060405162002b8038038062002b8083398181016040528101906200003c91906200019c565b81818160009080519060200190620000569291906200007a565b5080600190805190602001906200006f9291906200007a565b50505050506200037f565b8280546200008890620002a4565b90600052602060002090601f016020900481019282620000ac5760008555620000f8565b82601f10620000c757805160ff1916838001178555620000f8565b82800160010185558215620000f8579182015b82811115620000f7578251825591602001919060010190620000da565b5b5090506200010791906200010b565b5090565b5b80821115620001265760008160009055506001016200010c565b5090565b6000620001416200013b8462000238565b6200020f565b9050828152602081018484840111156200015a57600080fd5b620001678482856200026e565b509392505050565b600082601f8301126200018157600080fd5b8151620001938482602086016200012a565b91505092915050565b60008060408385031215620001b057600080fd5b600083015167ffffffffffffffff811115620001cb57600080fd5b620001d9858286016200016f565b925050602083015167ffffffffffffffff811115620001f757600080fd5b62000205858286016200016f565b9150509250929050565b60006200021b6200022e565b9050620002298282620002da565b919050565b6000604051905090565b600067ffffffffffffffff8211156200025657620002556200033f565b5b62000261826200036e565b9050602081019050919050565b60005b838110156200028e57808201518184015260208101905062000271565b838111156200029e576000848401525b50505050565b60006002820490506001821680620002bd57607f821691505b60208210811415620002d457620002d362000310565b5b50919050565b620002e5826200036e565b810181811067ffffffffffffffff821117156200030757620003066200033f565b5b80604052505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6000601f19601f8301169050919050565b6127f1806200038f6000396000f3fe608060405234801561001057600080fd5b50600436106100ea5760003560e01c80636a6278421161008c578063a22cb46511610066578063a22cb4651461025b578063b88d4fde14610277578063c87b56dd14610293578063e985e9c5146102c3576100ea565b80636a627842146101f157806370a082311461020d57806395d89b411461023d576100ea565b8063095ea7b3116100c8578063095ea7b31461016d57806323b872dd1461018957806342842e0e146101a55780636352211e146101c1576100ea565b806301ffc9a7146100ef57806306fdde031461011f578063081812fc1461013d575b600080fd5b61010960048036038101906101049190611c60565b6102f3565b6040516101169190611fb7565b60405180910390f35b6101276103d5565b6040516101349190611fd2565b60405180910390f35b61015760048036038101906101529190611cb2565b610467565b6040516101649190611f50565b60405180910390f35b61018760048036038101906101829190611c24565b6104ad565b005b6101a3600480360381019061019e9190611b1e565b6105c5565b005b6101bf60048036038101906101ba9190611b1e565b610625565b005b6101db60048036038101906101d69190611cb2565b610645565b6040516101e89190611f50565b60405180910390f35b61020b60048036038101906102069190611ab9565b6106cc565b005b61022760048036038101906102229190611ab9565b6106ef565b6040516102349190612154565b60405180910390f35b6102456107a7565b6040516102529190611fd2565b60405180910390f35b61027560048036038101906102709190611be8565b610839565b005b610291600480360381019061028c9190611b6d565b61084f565b005b6102ad60048036038101906102a89190611cb2565b6108b1565b6040516102ba9190611fd2565b60405180910390f35b6102dd60048036038101906102d89190611ae2565b610919565b6040516102ea9190611fb7565b60405180910390f35b60007f80ac58cd000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff191614806103be57507f5b5e139f000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916145b806103ce57506103cd826109ad565b5b9050919050565b6060600080546103e490612348565b80601f016020809104026020016040519081016040528092919081815260200182805461041090612348565b801561045d5780601f106104325761010080835404028352916020019161045d565b820191906000526020600020905b81548152906001019060200180831161044057829003601f168201915b5050505050905090565b600061047282610a17565b6004600083815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050919050565b60006104b882610645565b90508073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610529576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090612114565b60405180910390fd5b8073ffffffffffffffffffffffffffffffffffffffff16610548610a62565b73ffffffffffffffffffffffffffffffffffffffff161480610577575061057681610571610a62565b610919565b5b6105b6576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105ad90612134565b60405180910390fd5b6105c08383610a6a565b505050565b6105d66105d0610a62565b82610b23565b610615576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161060c90611ff4565b60405180910390fd5b610620838383610bb8565b505050565b6106408383836040518060200160405280600081525061084f565b505050565b60008061065183610eb2565b9050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156106c3576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016106ba906120f4565b60405180910390fd5b80915050919050565b6106ec81600660008154809291906106e3906123ab565b91905055610eef565b50565b60008073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610760576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610757906120b4565b60405180910390fd5b600360008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b6060600180546107b690612348565b80601f01602080910402602001604051908101604052809291908181526020018280546107e290612348565b801561082f5780601f106108045761010080835404028352916020019161082f565b820191906000526020600020905b81548152906001019060200180831161081257829003601f168201915b5050505050905090565b61084b610844610a62565b8383610f0d565b5050565b61086061085a610a62565b83610b23565b61089f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161089690611ff4565b60405180910390fd5b6108ab8484848461107a565b50505050565b60606108bc82610a17565b60006108c66110d6565b905060008151116108e65760405180602001604052806000815250610911565b806108f0846110ed565b604051602001610901929190611f2c565b6040516020818303038152906040525b915050919050565b6000600560008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff16905092915050565b60007f01ffc9a7000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916149050919050565b610a2081611211565b610a5f576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a56906120f4565b60405180910390fd5b50565b600033905090565b816004600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff16610add83610645565b73ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92560405160405180910390a45050565b600080610b2f83610645565b90508073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff161480610b715750610b708185610919565b5b80610baf57508373ffffffffffffffffffffffffffffffffffffffff16610b9784610467565b73ffffffffffffffffffffffffffffffffffffffff16145b91505092915050565b8273ffffffffffffffffffffffffffffffffffffffff16610bd882610645565b73ffffffffffffffffffffffffffffffffffffffff1614610c2e576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c2590612034565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610c9e576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c9590612074565b60405180910390fd5b610cab8383836001611252565b8273ffffffffffffffffffffffffffffffffffffffff16610ccb82610645565b73ffffffffffffffffffffffffffffffffffffffff1614610d21576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610d1890612034565b60405180910390fd5b6004600082815260200190815260200160002060006101000a81549073ffffffffffffffffffffffffffffffffffffffff02191690556001600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055506001600360008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282540192505081905550816002600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60405160405180910390a4610ead8383836001611378565b505050565b60006002600083815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050919050565b610f0982826040518060200160405280600081525061137e565b5050565b8173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610f7c576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610f7390612094565b60405180910390fd5b80600560008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff0219169083151502179055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c318360405161106d9190611fb7565b60405180910390a3505050565b611085848484610bb8565b611091848484846113d9565b6110d0576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016110c790612014565b60405180910390fd5b50505050565b606060405180602001604052806000815250905090565b6060600060016110fc84611570565b01905060008167ffffffffffffffff811115611141577f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6040519080825280601f01601f1916602001820160405280156111735781602001600182028036833780820191505090505b509050600082602001820190505b600115611206578080600190039150507f3031323334353637383961626364656600000000000000000000000000000000600a86061a8153600a85816111f0577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b049450600085141561120157611206565b611181565b819350505050919050565b60008073ffffffffffffffffffffffffffffffffffffffff1661123383610eb2565b73ffffffffffffffffffffffffffffffffffffffff1614159050919050565b600181111561137257600073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff16146112e65780600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282546112de919061225e565b925050819055505b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff16146113715780600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282546113699190612208565b925050819055505b5b50505050565b50505050565b61138883836117a7565b61139560008484846113d9565b6113d4576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016113cb90612014565b60405180910390fd5b505050565b60006113fa8473ffffffffffffffffffffffffffffffffffffffff166119c5565b15611563578373ffffffffffffffffffffffffffffffffffffffff1663150b7a02611423610a62565b8786866040518563ffffffff1660e01b81526004016114459493929190611f6b565b602060405180830381600087803b15801561145f57600080fd5b505af192505050801561149057506040513d601f19601f8201168201806040525081019061148d9190611c89565b60015b611513573d80600081146114c0576040519150601f19603f3d011682016040523d82523d6000602084013e6114c5565b606091505b5060008151141561150b576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161150290612014565b60405180910390fd5b805181602001fd5b63150b7a0260e01b7bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916817bffffffffffffffffffffffffffffffffffffffffffffffffffffffff191614915050611568565b600190505b949350505050565b600080600090507a184f03e93ff9f4daa797ed6e38ed64bf6a1f01000000000000000083106115f4577a184f03e93ff9f4daa797ed6e38ed64bf6a1f01000000000000000083816115ea577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b0492506040810190505b6d04ee2d6d415b85acef81000000008310611657576d04ee2d6d415b85acef8100000000838161164d577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b0492506020810190505b662386f26fc1000083106116ac57662386f26fc1000083816116a2577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b0492506010810190505b6305f5e10083106116fb576305f5e10083816116f1577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b0492506008810190505b612710831061174657612710838161173c577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b0492506004810190505b6064831061178f5760648381611785577f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b0492506002810190505b600a831061179e576001810190505b80915050919050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415611817576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161180e906120d4565b60405180910390fd5b61182081611211565b15611860576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161185790612054565b60405180910390fd5b61186e600083836001611252565b61187781611211565b156118b7576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016118ae90612054565b60405180910390fd5b6001600360008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282540192505081905550816002600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60405160405180910390a46119c1600083836001611378565b5050565b6000808273ffffffffffffffffffffffffffffffffffffffff163b119050919050565b60006119fb6119f684612194565b61216f565b905082815260208101848484011115611a1357600080fd5b611a1e848285612306565b509392505050565b600081359050611a358161275f565b92915050565b600081359050611a4a81612776565b92915050565b600081359050611a5f8161278d565b92915050565b600081519050611a748161278d565b92915050565b600082601f830112611a8b57600080fd5b8135611a9b8482602086016119e8565b91505092915050565b600081359050611ab3816127a4565b92915050565b600060208284031215611acb57600080fd5b6000611ad984828501611a26565b91505092915050565b60008060408385031215611af557600080fd5b6000611b0385828601611a26565b9250506020611b1485828601611a26565b9150509250929050565b600080600060608486031215611b3357600080fd5b6000611b4186828701611a26565b9350506020611b5286828701611a26565b9250506040611b6386828701611aa4565b9150509250925092565b60008060008060808587031215611b8357600080fd5b6000611b9187828801611a26565b9450506020611ba287828801611a26565b9350506040611bb387828801611aa4565b925050606085013567ffffffffffffffff811115611bd057600080fd5b611bdc87828801611a7a565b91505092959194509250565b60008060408385031215611bfb57600080fd5b6000611c0985828601611a26565b9250506020611c1a85828601611a3b565b9150509250929050565b60008060408385031215611c3757600080fd5b6000611c4585828601611a26565b9250506020611c5685828601611aa4565b9150509250929050565b600060208284031215611c7257600080fd5b6000611c8084828501611a50565b91505092915050565b600060208284031215611c9b57600080fd5b6000611ca984828501611a65565b91505092915050565b600060208284031215611cc457600080fd5b6000611cd284828501611aa4565b91505092915050565b611ce481612292565b82525050565b611cf3816122a4565b82525050565b6000611d04826121c5565b611d0e81856121db565b9350611d1e818560208601612315565b611d2781612481565b840191505092915050565b6000611d3d826121d0565b611d4781856121ec565b9350611d57818560208601612315565b611d6081612481565b840191505092915050565b6000611d76826121d0565b611d8081856121fd565b9350611d90818560208601612315565b80840191505092915050565b6000611da9602d836121ec565b9150611db482612492565b604082019050919050565b6000611dcc6032836121ec565b9150611dd7826124e1565b604082019050919050565b6000611def6025836121ec565b9150611dfa82612530565b604082019050919050565b6000611e12601c836121ec565b9150611e1d8261257f565b602082019050919050565b6000611e356024836121ec565b9150611e40826125a8565b604082019050919050565b6000611e586019836121ec565b9150611e63826125f7565b602082019050919050565b6000611e7b6029836121ec565b9150611e8682612620565b604082019050919050565b6000611e9e6020836121ec565b9150611ea98261266f565b602082019050919050565b6000611ec16018836121ec565b9150611ecc82612698565b602082019050919050565b6000611ee46021836121ec565b9150611eef826126c1565b604082019050919050565b6000611f07603d836121ec565b9150611f1282612710565b604082019050919050565b611f26816122fc565b82525050565b6000611f388285611d6b565b9150611f448284611d6b565b91508190509392505050565b6000602082019050611f656000830184611cdb565b92915050565b6000608082019050611f806000830187611cdb565b611f8d6020830186611cdb565b611f9a6040830185611f1d565b8181036060830152611fac8184611cf9565b905095945050505050565b6000602082019050611fcc6000830184611cea565b92915050565b60006020820190508181036000830152611fec8184611d32565b905092915050565b6000602082019050818103600083015261200d81611d9c565b9050919050565b6000602082019050818103600083015261202d81611dbf565b9050919050565b6000602082019050818103600083015261204d81611de2565b9050919050565b6000602082019050818103600083015261206d81611e05565b9050919050565b6000602082019050818103600083015261208d81611e28565b9050919050565b600060208201905081810360008301526120ad81611e4b565b9050919050565b600060208201905081810360008301526120cd81611e6e565b9050919050565b600060208201905081810360008301526120ed81611e91565b9050919050565b6000602082019050818103600083015261210d81611eb4565b9050919050565b6000602082019050818103600083015261212d81611ed7565b9050919050565b6000602082019050818103600083015261214d81611efa565b9050919050565b60006020820190506121696000830184611f1d565b92915050565b600061217961218a565b9050612185828261237a565b919050565b6000604051905090565b600067ffffffffffffffff8211156121af576121ae612452565b5b6121b882612481565b9050602081019050919050565b600081519050919050565b600081519050919050565b600082825260208201905092915050565b600082825260208201905092915050565b600081905092915050565b6000612213826122fc565b915061221e836122fc565b9250827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff03821115612253576122526123f4565b5b828201905092915050565b6000612269826122fc565b9150612274836122fc565b925082821015612287576122866123f4565b5b828203905092915050565b600061229d826122dc565b9050919050565b60008115159050919050565b60007fffffffff0000000000000000000000000000000000000000000000000000000082169050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000819050919050565b82818337600083830152505050565b60005b83811015612333578082015181840152602081019050612318565b83811115612342576000848401525b50505050565b6000600282049050600182168061236057607f821691505b6020821081141561237457612373612423565b5b50919050565b61238382612481565b810181811067ffffffffffffffff821117156123a2576123a1612452565b5b80604052505050565b60006123b6826122fc565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8214156123e9576123e86123f4565b5b600182019050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6000601f19601f8301169050919050565b7f4552433732313a2063616c6c6572206973206e6f7420746f6b656e206f776e6560008201527f72206f7220617070726f76656400000000000000000000000000000000000000602082015250565b7f4552433732313a207472616e7366657220746f206e6f6e20455243373231526560008201527f63656976657220696d706c656d656e7465720000000000000000000000000000602082015250565b7f4552433732313a207472616e736665722066726f6d20696e636f72726563742060008201527f6f776e6572000000000000000000000000000000000000000000000000000000602082015250565b7f4552433732313a20746f6b656e20616c7265616479206d696e74656400000000600082015250565b7f4552433732313a207472616e7366657220746f20746865207a65726f2061646460008201527f7265737300000000000000000000000000000000000000000000000000000000602082015250565b7f4552433732313a20617070726f766520746f2063616c6c657200000000000000600082015250565b7f4552433732313a2061646472657373207a65726f206973206e6f74206120766160008201527f6c6964206f776e65720000000000000000000000000000000000000000000000602082015250565b7f4552433732313a206d696e7420746f20746865207a65726f2061646472657373600082015250565b7f4552433732313a20696e76616c696420746f6b656e2049440000000000000000600082015250565b7f4552433732313a20617070726f76616c20746f2063757272656e74206f776e6560008201527f7200000000000000000000000000000000000000000000000000000000000000602082015250565b7f4552433732313a20617070726f76652063616c6c6572206973206e6f7420746f60008201527f6b656e206f776e6572206f7220617070726f76656420666f7220616c6c000000602082015250565b61276881612292565b811461277357600080fd5b50565b61277f816122a4565b811461278a57600080fd5b50565b612796816122b0565b81146127a157600080fd5b50565b6127ad816122fc565b81146127b857600080fd5b5056fea264697066735822122081cc551bc6d29594eaf36ece0da52af221587575fe93fcb37decc025948e4fc364736f6c63430008040033";

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
