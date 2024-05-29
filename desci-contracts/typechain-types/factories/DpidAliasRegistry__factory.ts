/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type {
  DpidAliasRegistry,
  DpidAliasRegistryInterface,
} from "../DpidAliasRegistry";

const _abi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "dpid",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "streamID",
        type: "string",
      },
    ],
    name: "DpidMinted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "dpid",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            components: [
              {
                internalType: "string",
                name: "cid",
                type: "string",
              },
              {
                internalType: "uint256",
                name: "time",
                type: "uint256",
              },
            ],
            internalType: "struct DpidAliasRegistry.LegacyVersion[]",
            name: "versions",
            type: "tuple[]",
          },
        ],
        indexed: false,
        internalType: "struct DpidAliasRegistry.LegacyDpidEntry",
        name: "entry",
        type: "tuple",
      },
    ],
    name: "ImportedDpid",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "version",
        type: "uint8",
      },
    ],
    name: "Initialized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "dpid",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "streamId",
        type: "string",
      },
    ],
    name: "UpgradedDpid",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_firstDpid",
        type: "uint256",
      },
    ],
    name: "__DpidAliasRegistry_init",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "streamId",
        type: "string",
      },
    ],
    name: "find",
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
    inputs: [],
    name: "firstDpid",
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
        name: "dpid",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            components: [
              {
                internalType: "string",
                name: "cid",
                type: "string",
              },
              {
                internalType: "uint256",
                name: "time",
                type: "uint256",
              },
            ],
            internalType: "struct DpidAliasRegistry.LegacyVersion[]",
            name: "versions",
            type: "tuple[]",
          },
        ],
        internalType: "struct DpidAliasRegistry.LegacyDpidEntry",
        name: "entry",
        type: "tuple",
      },
    ],
    name: "importLegacyDpid",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "legacy",
    outputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "dpid",
        type: "uint256",
      },
    ],
    name: "legacyLookup",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            components: [
              {
                internalType: "string",
                name: "cid",
                type: "string",
              },
              {
                internalType: "uint256",
                name: "time",
                type: "uint256",
              },
            ],
            internalType: "struct DpidAliasRegistry.LegacyVersion[]",
            name: "versions",
            type: "tuple[]",
          },
        ],
        internalType: "struct DpidAliasRegistry.LegacyDpidEntry",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "streamId",
        type: "string",
      },
    ],
    name: "mintDpid",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "nextDpid",
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
    inputs: [],
    name: "owner",
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
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "registry",
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
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "dpid",
        type: "uint256",
      },
    ],
    name: "resolve",
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
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    name: "reverseRegistry",
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
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "dpid",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "streamId",
        type: "string",
      },
    ],
    name: "upgradeDpid",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x60806040523480156200001157600080fd5b50620000226200002860201b60201c565b620001d3565b600060019054906101000a900460ff16156200007b576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401620000729062000127565b60405180910390fd5b60ff801660008054906101000a900460ff1660ff161015620000ed5760ff6000806101000a81548160ff021916908360ff1602179055507f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb384740249860ff604051620000e4919062000149565b60405180910390a15b565b6000620000fe60278362000166565b91506200010b8262000184565b604082019050919050565b620001218162000177565b82525050565b600060208201905081810360008301526200014281620000ef565b9050919050565b600060208201905062000160600083018462000116565b92915050565b600082825260208201905092915050565b600060ff82169050919050565b7f496e697469616c697a61626c653a20636f6e747261637420697320696e69746960008201527f616c697a696e6700000000000000000000000000000000000000000000000000602082015250565b6126a680620001e36000396000f3fe608060405234801561001057600080fd5b50600436106100f55760003560e01c8063810a9afa11610097578063b724de3a11610066578063b724de3a14610298578063cfb452b5146102c8578063ded8896b146102e6578063f2fde38b14610302576100f5565b8063810a9afa146101fc57806382b7b5001461022c5780638da5cb5b1461025c578063afc269111461027a576100f5565b8063587a8cbf116100d3578063587a8cbf146101625780635893253c14610192578063715018a6146101c2578063788243d5146101cc576100f5565b8063144ae855146100fa578063362b3e63146101165780634f896d4f14610132575b600080fd5b610114600480360381019061010f919061111f565b61031e565b005b610130600480360381019061012b919061109e565b610386565b005b61014c6004803603810190610147919061109e565b6104d3565b604051610159919061161c565b60405180910390f35b61017c6004803603810190610177919061105d565b610578565b6040516101899190611740565b60405180910390f35b6101ac60048036038101906101a7919061109e565b6105a6565b6040516101b9919061161c565b60405180910390f35b6101ca610646565b005b6101e660048036038101906101e1919061109e565b61065a565b6040516101f391906115e6565b60405180910390f35b6102166004803603810190610211919061109e565b610698565b604051610223919061171e565b60405180910390f35b61024660048036038101906102419190611018565b610816565b6040516102539190611740565b60405180910390f35b610264610841565b60405161027191906115e6565b60405180910390f35b61028261086b565b60405161028f9190611740565b60405180910390f35b6102b260048036038101906102ad9190611018565b610871565b6040516102bf9190611740565b60405180910390f35b6102d0610981565b6040516102dd9190611740565b60405180910390f35b61030060048036038101906102fb91906110c7565b610987565b005b61031c60048036038101906103179190610fef565b610b78565b005b610326610bfc565b8060696000848152602001908152602001600020818161034691906125c9565b9050507fa9c55ebaa1fada408bd72c2f0ea7c27f5444b105bcff12c5381baac912156ada828260405161037a92919061178d565b60405180910390a15050565b60008060019054906101000a900460ff161590508080156103b75750600160008054906101000a900460ff1660ff16105b806103e457506103c630610c7a565b1580156103e35750600160008054906101000a900460ff1660ff16145b5b610423576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161041a9061169e565b60405180910390fd5b60016000806101000a81548160ff021916908360ff1602179055508015610460576001600060016101000a81548160ff0219169083151502179055505b610468610c9d565b816065819055508160668190555080156104cf5760008060016101000a81548160ff0219169083151502179055507f7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb384740249860016040516104c69190611601565b60405180910390a15b5050565b60606067600083815260200190815260200160002080546104f390611fa8565b80601f016020809104026020016040519081016040528092919081815260200182805461051f90611fa8565b801561056c5780601f106105415761010080835404028352916020019161056c565b820191906000526020600020905b81548152906001019060200180831161054f57829003601f168201915b50505050509050919050565b6068818051602081018201805184825260208301602085012081835280955050505050506000915090505481565b606760205280600052604060002060009150905080546105c590611fa8565b80601f01602080910402602001604051908101604052809291908181526020018280546105f190611fa8565b801561063e5780601f106106135761010080835404028352916020019161063e565b820191906000526020600020905b81548152906001019060200180831161062157829003601f168201915b505050505081565b61064e610bfc565b6106586000610cf6565b565b60696020528060005260406000206000915090508060000160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081565b6106a0610e25565b606960008381526020019081526020016000206040518060400160405290816000820160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200160018201805480602002602001604051908101604052809291908181526020016000905b82821015610807578382906000526020600020906002020160405180604001604052908160008201805461076c90611fa8565b80601f016020809104026020016040519081016040528092919081815260200182805461079890611fa8565b80156107e55780601f106107ba576101008083540402835291602001916107e5565b820191906000526020600020905b8154815290600101906020018083116107c857829003601f168201915b5050505050815260200160018201548152505081526020019060010190610739565b50505050815250509050919050565b60006068838360405161082a9291906115cd565b908152602001604051809103902054905092915050565b6000603360009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b60665481565b600080606884846040516108869291906115cd565b908152602001604051809103902054146108d5576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016108cc9061167e565b60405180910390fd5b6000606654905083836067600084815260200190815260200160002091906108fe929190610e55565b5080606885856040516109129291906115cd565b9081526020016040518091039020819055507f96a65efbb6991f67fc8a4c7550fcfd08f1968737d2f5adcded5cd937b3cc0f3d8185856040516109579392919061175b565b60405180910390a16066600081548092919061097290612027565b91905055508091505092915050565b60655481565b60006067600085815260200190815260200160002080546109a790611fa8565b9050146109e9576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016109e09061163e565b60405180910390fd5b6000606883836040516109fd9291906115cd565b90815260200160405180910390205414610a4c576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a439061167e565b60405180910390fd5b3373ffffffffffffffffffffffffffffffffffffffff166069600085815260200190815260200160002060000160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1614610af0576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610ae7906116fe565b60405180910390fd5b8181606760008681526020019081526020016000209190610b12929190610e55565b508260688383604051610b269291906115cd565b9081526020016040518091039020819055507f442b41840a10393534508176faee6f70b1870707dc24573b67d49f28cbac7f1c838383604051610b6b9392919061175b565b60405180910390a1505050565b610b80610bfc565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff161415610bf0576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610be79061165e565b60405180910390fd5b610bf981610cf6565b50565b610c04610dbc565b73ffffffffffffffffffffffffffffffffffffffff16610c22610841565b73ffffffffffffffffffffffffffffffffffffffff1614610c78576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c6f906116be565b60405180910390fd5b565b6000808273ffffffffffffffffffffffffffffffffffffffff163b119050919050565b600060019054906101000a900460ff16610cec576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610ce3906116de565b60405180910390fd5b610cf4610dc4565b565b6000603360009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081603360006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a35050565b600033905090565b600060019054906101000a900460ff16610e13576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610e0a906116de565b60405180910390fd5b610e23610e1e610dbc565b610cf6565b565b6040518060400160405280600073ffffffffffffffffffffffffffffffffffffffff168152602001606081525090565b828054610e6190611fa8565b90600052602060002090601f016020900481019282610e835760008555610eca565b82601f10610e9c57803560ff1916838001178555610eca565b82800160010185558215610eca579182015b82811115610ec9578235825591602001919060010190610eae565b5b509050610ed79190610edb565b5090565b5b80821115610ef4576000816000905550600101610edc565b5090565b6000610f0b610f06846118b4565b61188f565b905082815260208101848484011115610f2357600080fd5b610f2e848285611eda565b509392505050565b600081359050610f458161263d565b92915050565b60008083601f840112610f5d57600080fd5b8235905067ffffffffffffffff811115610f7657600080fd5b602083019150836001820283011115610f8e57600080fd5b9250929050565b600082601f830112610fa657600080fd5b8135610fb6848260208601610ef8565b91505092915050565b600060408284031215610fd157600080fd5b81905092915050565b600081359050610fe981612654565b92915050565b60006020828403121561100157600080fd5b600061100f84828501610f36565b91505092915050565b6000806020838503121561102b57600080fd5b600083013567ffffffffffffffff81111561104557600080fd5b61105185828601610f4b565b92509250509250929050565b60006020828403121561106f57600080fd5b600082013567ffffffffffffffff81111561108957600080fd5b61109584828501610f95565b91505092915050565b6000602082840312156110b057600080fd5b60006110be84828501610fda565b91505092915050565b6000806000604084860312156110dc57600080fd5b60006110ea86828701610fda565b935050602084013567ffffffffffffffff81111561110757600080fd5b61111386828701610f4b565b92509250509250925092565b6000806040838503121561113257600080fd5b600061114085828601610fda565b925050602083013567ffffffffffffffff81111561115d57600080fd5b61116985828601610fbf565b9150509250929050565b600061117f8383611523565b905092915050565b60006111938383611572565b905092915050565b6111a481611c2e565b82525050565b6111b381611c2e565b82525050565b60006111c58385611991565b9350836020840285016111d7846118fc565b8060005b8781101561121b5784840389526111f28284611b99565b6111fc8582611173565b945061120783611977565b925060208a019950506001810190506111db565b50829750879450505050509392505050565b60006112388261194b565b6112428185611991565b93508360208202850161125485611906565b8060005b8581101561129057848403895281516112718582611187565b945061127c83611984565b925060208a01995050600181019050611258565b50829750879550505050505092915050565b6112ab81611d1d565b82525050565b60006112bd83856119a2565b93506112ca838584611eda565b6112d38361227e565b840190509392505050565b60006112ea83856119b3565b93506112f7838584611eda565b6113008361227e565b840190509392505050565b600061131783856119c4565b9350611324838584611eda565b82840190509392505050565b600061133b8261196c565b61134581856119a2565b9350611355818560208601611ee9565b61135e8161227e565b840191505092915050565b60006113748261196c565b61137e81856119b3565b935061138e818560208601611ee9565b6113978161227e565b840191505092915050565b60006113af6015836119b3565b91506113ba8261230a565b602082019050919050565b60006113d26026836119b3565b91506113dd82612333565b604082019050919050565b60006113f56019836119b3565b915061140082612382565b602082019050919050565b6000611418602e836119b3565b9150611423826123ab565b604082019050919050565b600061143b6020836119b3565b9150611446826123fa565b602082019050919050565b600061145e602b836119b3565b915061146982612423565b604082019050919050565b60006114816019836119b3565b915061148c82612472565b602082019050919050565b6000604083016114aa6000840184611ad4565b6114b7600086018261119b565b506114c56020840184611aeb565b85830360208701526114d88382846111b9565b925050508091505092915050565b60006040830160008301516114fe600086018261119b565b5060208301518482036020860152611516828261122d565b9150508091505092915050565b6000604083016115366000840184611b42565b85830360008701526115498382846112b1565b9250505061155a6020840184611bbd565b61156760208601826115af565b508091505092915050565b6000604083016000830151848203600086015261158f8282611330565b91505060208301516115a460208601826115af565b508091505092915050565b6115b881611c60565b82525050565b6115c781611c60565b82525050565b60006115da82848661130b565b91508190509392505050565b60006020820190506115fb60008301846111aa565b92915050565b600060208201905061161660008301846112a2565b92915050565b600060208201905081810360008301526116368184611369565b905092915050565b60006020820190508181036000830152611657816113a2565b9050919050565b60006020820190508181036000830152611677816113c5565b9050919050565b60006020820190508181036000830152611697816113e8565b9050919050565b600060208201905081810360008301526116b78161140b565b9050919050565b600060208201905081810360008301526116d78161142e565b9050919050565b600060208201905081810360008301526116f781611451565b9050919050565b6000602082019050818103600083015261171781611474565b9050919050565b6000602082019050818103600083015261173881846114e6565b905092915050565b600060208201905061175560008301846115be565b92915050565b600060408201905061177060008301866115be565b81810360208301526117838184866112de565b9050949350505050565b60006040820190506117a260008301856115be565b81810360208301526117b48184611497565b90509392505050565b600080833560016020038436030381126117d657600080fd5b80840192508235915067ffffffffffffffff8211156117f457600080fd5b60208301925060208202360383131561180c57600080fd5b509250929050565b6000808335600160200384360303811261182d57600080fd5b80840192508235915067ffffffffffffffff82111561184b57600080fd5b60208301925060018202360383131561186357600080fd5b509250929050565b60008235600160400383360303811261188357600080fd5b80830191505092915050565b60006118996118aa565b90506118a58282611ff6565b919050565b6000604051905090565b600067ffffffffffffffff8211156118cf576118ce61211b565b5b6118d88261227e565b9050602081019050919050565b60008190506118f5826002611bd4565b9050919050565b6000819050919050565b6000819050602082019050919050565b60008190508160005260206000209050919050565b60008190508160005260206000209050919050565b600082905092915050565b600081519050919050565b600081549050919050565b600082905092915050565b600081519050919050565b6000602082019050919050565b6000602082019050919050565b600082825260208201905092915050565b600082825260208201905092915050565b600082825260208201905092915050565b600081905092915050565b6020841060008114611a2857601f8411600181146119f8576119f18685611fda565b8355611a22565b611a018361192b565b611a166020601f880104820160018301611c85565b611a20878561249b565b505b50611a71565b611a318261192b565b6020601f8701048101601f87168015611a5257611a51816001840361214a565b5b611a646020601f890104840183611c85565b6001886002021785555050505b5050505050565b6020831060008114611ac3576020851060008114611aa157611a9a8685611fda565b8355611abd565b8360ff1916935083611ab28461192b565b556001866002020183555b50611acd565b6001856002020182555b5050505050565b6000611ae36020840184610f36565b905092915050565b60008083356001602003843603038112611b0457600080fd5b83810192508235915060208301925067ffffffffffffffff821115611b2857600080fd5b602082023603841315611b3a57600080fd5b509250929050565b60008083356001602003843603038112611b5b57600080fd5b83810192508235915060208301925067ffffffffffffffff821115611b7f57600080fd5b600182023603841315611b9157600080fd5b509250929050565b600082356001604003833603038112611bb157600080fd5b82810191505092915050565b6000611bcc6020840184610fda565b905092915050565b6000611bdf82611c60565b9150611bea83611c60565b9250817fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0483118215151615611c2357611c226120bd565b5b828202905092915050565b6000611c3982611c40565b9050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000819050919050565b600060ff82169050919050565b611c82600082612229565b50565b5b81811015611ca457611c996000826122f2565b600181019050611c86565b5050565b5b81811015611cc757611cbc6000826122d4565b600281019050611ca9565b5050565b81811015611ce957611cde6000826122f2565b600181019050611ccb565b5050565b611cfa60008083016122b6565b611d086000600183016122f2565b50565b6000611d1682611d2f565b9050919050565b6000611d2882611c6a565b9050919050565b6000611d3a82611d41565b9050919050565b6000611d4c82611c40565b9050919050565b6000611d5e82611c60565b9050919050565b611d6f8383611940565b611d7981836121c5565b611d82836118fc565b611d8b83611916565b6000805b84811015611dc457611da1848861186b565b611dac8184866125fa565b60208501945060028401935050600181019050611d8f565b5050505050505050565b611dd88383611961565b67ffffffffffffffff811115611df157611df061211b565b5b611dfb8254611fa8565b600080601f8411601f84111715611e1857611e158561192b565b90505b601f831115611e4b576020601f85010481016020851015611e37578190505b611e496020601f860104830182611c85565b505b601f841160018114611e785760008515611e66578388013590505b611e708682611fda565b875550611ed0565b601f1985168260005b82811015611ea657858a01358255600182019150602086019550602081019050611e81565b87831015611ec357858a0135611ebf601f8a1682612070565b8355505b6001600289020189555050505b5050505050505050565b82818337600083830152505050565b60005b83811015611f07578082015181840152602081019050611eec565b83811115611f16576000848401525b50505050565b600081016000830180611f2e81612199565b9050611f3a8184612586565b5050506001810160208301611f4f81856117bd565b611f5a8183866125a9565b505050505050565b6000810160008301611f748185611814565b611f7f8183866125b9565b50505050600181016020830180611f95816121af565b9050611fa181846125d7565b5050505050565b60006002820490506001821680611fc057607f821691505b60208210811415611fd457611fd36120ec565b5b50919050565b6000611fe68383612070565b9150826002028217905092915050565b611fff8261227e565b810181811067ffffffffffffffff8211171561201e5761201d61211b565b5b80604052505050565b600061203282611c60565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff821415612065576120646120bd565b5b600182019050919050565b6000612081600019846008026122a9565b1980831691505092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052600060045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b61217a7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff836020036008026122a9565b815481168255505050565b6000819050919050565b6000819050919050565b600081356121a68161263d565b80915050919050565b600081356121bc81612654565b80915050919050565b680100000000000000008211156121df576121de61211b565b5b6121e881611956565b82825580831015612224576121fc816118e5565b612205846118e5565b61220e84611916565b81810183820161221e8183611ca8565b50505050505b505050565b680100000000000000008211156122435761224261211b565b5b805461224e81611fa8565b808411156122635761226284828486611a78565b5b8084101561227857612277848284866119cf565b5b50505050565b6000601f19601f8301169050919050565b60008160001b9050919050565b600082821b905092915050565b600082821c905092915050565b600082146122c7576122c661208e565b5b6122d081611c77565b5050565b600082146122e5576122e461208e565b5b6122ee81611ced565b5050565b6122fa61266b565b612305818484612618565b505050565b7f6470696420616c72656164792075706772616465640000000000000000000000600082015250565b7f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160008201527f6464726573730000000000000000000000000000000000000000000000000000602082015250565b7f73747265616d20616c7265616479206861732061206450494400000000000000600082015250565b7f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160008201527f647920696e697469616c697a6564000000000000000000000000000000000000602082015250565b7f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572600082015250565b7f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960008201527f6e697469616c697a696e67000000000000000000000000000000000000000000602082015250565b7f756e617574686f72697a65642064706964207570677261646500000000000000600082015250565b6124a48161192b565b6124af838254611fda565b8083556000825550505050565b600073ffffffffffffffffffffffffffffffffffffffff6124dc8461228f565b9350801983169250808416831791505092915050565b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff61251e8461228f565b9350801983169250808416831791505092915050565b6000600883026125647fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8261229c565b61256e868361229c565b95508019841693508086168417925050509392505050565b61258f82611d0b565b6125a261259b82612185565b83546124bc565b8255505050565b6125b4838383611d65565b505050565b6125c4838383611dce565b505050565b6125d38282611f1c565b5050565b6125e082611d53565b6125f36125ec8261218f565b83546124f2565b8255505050565b81156126095761260861208e565b5b6126138382611f62565b505050565b61262183611d53565b61263561262d8261218f565b848454612534565b825550505050565b61264681611c2e565b811461265157600080fd5b50565b61265d81611c60565b811461266857600080fd5b50565b60009056fea2646970667358221220cb403f7adc2fb139c3c9359219d93f9c0d9a168b2bc26c7936cfd7429f94f50064736f6c63430008040033";

type DpidAliasRegistryConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: DpidAliasRegistryConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class DpidAliasRegistry__factory extends ContractFactory {
  constructor(...args: DpidAliasRegistryConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
    this.contractName = "DpidAliasRegistry";
  }

  deploy(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<DpidAliasRegistry> {
    return super.deploy(overrides || {}) as Promise<DpidAliasRegistry>;
  }
  getDeployTransaction(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(overrides || {});
  }
  attach(address: string): DpidAliasRegistry {
    return super.attach(address) as DpidAliasRegistry;
  }
  connect(signer: Signer): DpidAliasRegistry__factory {
    return super.connect(signer) as DpidAliasRegistry__factory;
  }
  static readonly contractName: "DpidAliasRegistry";
  public readonly contractName: "DpidAliasRegistry";
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): DpidAliasRegistryInterface {
    return new utils.Interface(_abi) as DpidAliasRegistryInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): DpidAliasRegistry {
    return new Contract(address, _abi, signerOrProvider) as DpidAliasRegistry;
  }
}