export * as typechain from "./typechain-types/index.js";
import localRoInfo from "./.openzeppelin/unknown-research-object.json";
import localDpidInfo from "./.openzeppelin/unknown-dpid.json";
import devRoInfo from "./.openzeppelin/sepoliaDev-research-object.json";
import devDpidInfo from "./.openzeppelin/sepoliaDev-dpid.json";
import prodRoInfo from "./.openzeppelin/sepoliaProd-research-object.json";
import prodDpidInfo from "./.openzeppelin/sepoliaProd-dpid.json";
import localDpidAliasInfo from "./.openzeppelin/unknown-dpid-alias-registry.json";

export const contracts = {
  localRoInfo,
  localDpidInfo,
  devRoInfo,
  devDpidInfo,
  prodRoInfo,
  prodDpidInfo,
  localDpidAliasInfo,
};
