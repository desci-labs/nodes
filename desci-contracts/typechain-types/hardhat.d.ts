/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { ethers } from "ethers";
import {
  FactoryOptions,
  HardhatEthersHelpers as HardhatEthersHelpersBase,
} from "@nomiclabs/hardhat-ethers/types";

import * as Contracts from ".";

declare module "hardhat/types/runtime" {
  interface HardhatEthersHelpers extends HardhatEthersHelpersBase {
    getContractFactory(
      name: "BasePaymaster",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BasePaymaster__factory>;
    getContractFactory(
      name: "ERC2771Recipient",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC2771Recipient__factory>;
    getContractFactory(
      name: "IForwarder",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IForwarder__factory>;
    getContractFactory(
      name: "IERC2771Recipient",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC2771Recipient__factory>;
    getContractFactory(
      name: "IPaymaster",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IPaymaster__factory>;
    getContractFactory(
      name: "IRelayHub",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IRelayHub__factory>;
    getContractFactory(
      name: "IStakeManager",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IStakeManager__factory>;
    getContractFactory(
      name: "GsnEip712Library",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.GsnEip712Library__factory>;
    getContractFactory(
      name: "OwnableUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.OwnableUpgradeable__factory>;
    getContractFactory(
      name: "Initializable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Initializable__factory>;
    getContractFactory(
      name: "ERC721Upgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC721Upgradeable__factory>;
    getContractFactory(
      name: "IERC721MetadataUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721MetadataUpgradeable__factory>;
    getContractFactory(
      name: "IERC721ReceiverUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721ReceiverUpgradeable__factory>;
    getContractFactory(
      name: "IERC721Upgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721Upgradeable__factory>;
    getContractFactory(
      name: "ContextUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ContextUpgradeable__factory>;
    getContractFactory(
      name: "ERC165Upgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC165Upgradeable__factory>;
    getContractFactory(
      name: "IERC165Upgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC165Upgradeable__factory>;
    getContractFactory(
      name: "Ownable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Ownable__factory>;
    getContractFactory(
      name: "IERC20",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC20__factory>;
    getContractFactory(
      name: "ERC721",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC721__factory>;
    getContractFactory(
      name: "IERC721Metadata",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721Metadata__factory>;
    getContractFactory(
      name: "IERC721",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721__factory>;
    getContractFactory(
      name: "IERC721Receiver",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC721Receiver__factory>;
    getContractFactory(
      name: "ERC165",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC165__factory>;
    getContractFactory(
      name: "IERC165",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC165__factory>;
    getContractFactory(
      name: "DpidRegistry",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.DpidRegistry__factory>;
    getContractFactory(
      name: "IDpidRegistry",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IDpidRegistry__factory>;
    getContractFactory(
      name: "ERC2771RecipientUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC2771RecipientUpgradeable__factory>;
    getContractFactory(
      name: "IERC2771RecipientUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC2771RecipientUpgradeable__factory>;
    getContractFactory(
      name: "Paymaster",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Paymaster__factory>;
    getContractFactory(
      name: "ResearchObject",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ResearchObject__factory>;
    getContractFactory(
      name: "TestERC721",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestERC721__factory>;
    getContractFactory(
      name: "VersionedERC721",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.VersionedERC721__factory>;

    getContractAt(
      name: "BasePaymaster",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.BasePaymaster>;
    getContractAt(
      name: "ERC2771Recipient",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC2771Recipient>;
    getContractAt(
      name: "IForwarder",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IForwarder>;
    getContractAt(
      name: "IERC2771Recipient",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC2771Recipient>;
    getContractAt(
      name: "IPaymaster",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IPaymaster>;
    getContractAt(
      name: "IRelayHub",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IRelayHub>;
    getContractAt(
      name: "IStakeManager",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IStakeManager>;
    getContractAt(
      name: "GsnEip712Library",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.GsnEip712Library>;
    getContractAt(
      name: "OwnableUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.OwnableUpgradeable>;
    getContractAt(
      name: "Initializable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Initializable>;
    getContractAt(
      name: "ERC721Upgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC721Upgradeable>;
    getContractAt(
      name: "IERC721MetadataUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721MetadataUpgradeable>;
    getContractAt(
      name: "IERC721ReceiverUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721ReceiverUpgradeable>;
    getContractAt(
      name: "IERC721Upgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721Upgradeable>;
    getContractAt(
      name: "ContextUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ContextUpgradeable>;
    getContractAt(
      name: "ERC165Upgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC165Upgradeable>;
    getContractAt(
      name: "IERC165Upgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC165Upgradeable>;
    getContractAt(
      name: "Ownable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Ownable>;
    getContractAt(
      name: "IERC20",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC20>;
    getContractAt(
      name: "ERC721",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC721>;
    getContractAt(
      name: "IERC721Metadata",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721Metadata>;
    getContractAt(
      name: "IERC721",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721>;
    getContractAt(
      name: "IERC721Receiver",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC721Receiver>;
    getContractAt(
      name: "ERC165",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC165>;
    getContractAt(
      name: "IERC165",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC165>;
    getContractAt(
      name: "DpidRegistry",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.DpidRegistry>;
    getContractAt(
      name: "IDpidRegistry",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IDpidRegistry>;
    getContractAt(
      name: "ERC2771RecipientUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC2771RecipientUpgradeable>;
    getContractAt(
      name: "IERC2771RecipientUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC2771RecipientUpgradeable>;
    getContractAt(
      name: "Paymaster",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Paymaster>;
    getContractAt(
      name: "ResearchObject",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ResearchObject>;
    getContractAt(
      name: "TestERC721",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.TestERC721>;
    getContractAt(
      name: "VersionedERC721",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.VersionedERC721>;

    // default types
    getContractFactory(
      name: string,
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<ethers.ContractFactory>;
    getContractFactory(
      abi: any[],
      bytecode: ethers.utils.BytesLike,
      signer?: ethers.Signer
    ): Promise<ethers.ContractFactory>;
    getContractAt(
      nameOrAbi: string | any[],
      address: string,
      signer?: ethers.Signer
    ): Promise<ethers.Contract>;
  }
}
