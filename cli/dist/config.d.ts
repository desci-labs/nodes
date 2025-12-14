import Conf from "conf";
import { type NodesEnv } from "@desci-labs/nodes-lib/node";
export type Environment = NodesEnv;
export interface CliConfig {
    apiKey?: string;
    privateKey?: string;
    environment: Environment;
    defaultNodeUuid?: string;
}
export declare const config: Conf<CliConfig>;
export declare const WEB_URLS: Record<Environment, string>;
export declare const IPFS_GATEWAYS: Record<Environment, string>;
export declare function getEnvConfig(): {
    apiUrl: string;
    ipfsGateway: string;
    webUrl: string;
};
export declare function getApiKey(): string | undefined;
export declare function setApiKey(key: string): void;
export declare function getPrivateKey(): string | undefined;
export declare function setPrivateKey(key: string): void;
export declare function clearPrivateKey(): void;
export declare function setEnvironment(env: Environment): void;
export declare function getEnvironment(): Environment;
export declare function clearConfig(): void;
/**
 * Initialize nodes-lib with the stored configuration.
 * Call this at CLI startup.
 */
export declare function initializeNodesLib(): void;
export declare function printCurrentConfig(): void;
