# Nodes integration library
This package allows programmatic interaction with the backend of [DeSci Nodes](https://nodes.desci.com), simplifying creation of research publications by abstracting away a lot of low level detail. In particular, constructing correctly formatted manifest files and handling pinning.

> **Note**
> If you are just eager to get started, do heed the instructions under the Configuration section first.
> API docs are available at [desci-labs.github.io/nodes](https://desci-labs.github.io/nodes).
> There is a starter project for building an integration project available [here](https://github.com/desci-labs/nodes-integration-template).

## Core concepts
Some terms are regularly referred to in the code documentation. When programmatically creating nodes, it's important to understand what these things are for the end results to make sense. The corresponding types for these data structures are available in [desci-models](https://github.com/desci-labs/nodes/blob/develop/desci-models/src/ResearchObject.ts).

### The manifest
The data structure of a research object is a JSON file which holds all information for the object,
either directly through constant fields, or indirectly through IPLD or web links.

Here is an example manifest file, we'll go through it piece by piece.
```json
{
  "version": "desci-nodes-0.2.0",
  "components": [
    {
      "id": "root",
      "name": "root",
      "type": "data-bucket",
      "payload": {
        "cid": "bafybeicrsddlvfbbo5s3upvjbtb5flc73iupxfy2kf3rv43kkbvegbqbwq",
        "path": "root"
      }
    },
    {
      "id": "05d6cfe7-d3f8-4590-97ee-bec0a4806c3c",
      "name": "manuscript.pdf",
      "type": "pdf",
      "subtype": "manuscript",
      "payload": {
        "cid": "bafybeiamslevhsvjlnfejg7p2rzk6bncioaapwb3oauu7zqwmfpwko5ho4",
        "path": "root/manuscript.pdf",
        "externalUrl": "https://mydomain.com/papers/manuscript.pdf"
      },
      "starred": true
    },
    {
      "id": "0b6afb37-0e95-49d4-80e3-1a3724979594",
      "name": "my search engine",
      "type": "link",
      "payload": {
        "url": "http://google.com",
        "path": "root"
      },
      "starred": false
    }
  ],
  "authors": [],
  "title": "My Node",
  "defaultLicense": "CC BY",
  "researchFields": []
}
```

### Components
In the manifest above, we see a `components` array. The first entry is a special one, the type `data-bucket` indicates that it holds the CID to the drive. The drive is an [UnixFS](https://github.com/ipfs/specs/blob/main/UNIXFS.md) tree that holds all of the actual data included in the research object.

Other components exist to attach metadata to individual files or folders inside the drive. This allows metadata to be added without changing the CID of the files and drive, and allows you to add metadata to external CID's and URL's.

The components are equipped with a UUID to allow moving files and updating files without the metadata mapping to break.

We can see two examples of other components. One is a file entry for a manuscript, which was added from an external URL, but is identified uniquely inside the node by the `path` and `cid` entires in the `payload`.

The other component (`my search engine`) is an external link, which is the one type of component which doesn't refer to an entry in the drive.

### Other fields
The other top-level fields contain a human-readable title, simple metadata about authorship, relevant research fields, and license information.

## Usage
### Configuration
By default, the library defaults to interacting with the nodes dev environment. This is the right place to fiddle around! Working against the dev environment means:
- Nodes will only resolve on https://nodes-dev.desci.com
- dPID registration transactions will be done against a testing contract
- Ceramic publishing is done on the Clay testnet

Configure your intended environment by calling the `setConfig` function. If you're not doing something very avant-garde, you can likely just pass a standard config instance like `NODESLIB_CONFIGS.local`. Otherwise, build up your own config object.

Note that your API key must be set manually by calling `setApiKey`, find more information in the Authentication section.

The `NODESLIB_CONFIGS.local` preset refers to a locally running docker-compose cluster as defined in the root of this repository, which can be started with `./dockerDev.sh`. See further instructions in the [repo root docs](../README.md).

### Drafts
A node that's being modified is always in a "draft" state, meaning that the changes are not public. They only become public when the node is published, after which it's possible to view without being authenticated. When new changes are made from this point, they are not publicly available until publish is done again.

Manifests cannot be submitted "whole", as the state of draft manifests are maintained internally as [automerge CRDT documents](https://automerge.org/). Hence, one needs to send change chunks so that the lib submitted changes can be interspersed with simultaneous webapp edits. This means that your calls will more or less instantly be reflected in the webapp.

### Authentication
Most functions ineracting with the Nodes backend require authentication, as they work on your private draft node. You can create an API key under your profile at [nodes.desci.com](https://nodes.desci.com). Set this using the `setApiKey` function.

Publishing to the dPID registry and/or Codex requires some type of cryptographic signing mechanism. The relevant functions take a `signer` argument, to which you can pass either a signer instance from Metamask, or use the helper function`signerFromPkey` to create one from a raw private key.

Note that publishing is done locally, so your key is not sent to the Nodes backend.

### Documentation
This section outlines the major functionality the library provides. It's not a complete rundown of all capabilities, but should be enough to get some inutition for the workflow.
More detailed docs generated from the code is available at the [doc site](https://desci-labs.github.io/nodes)!

#### Node operations
- `createDraftNode`: initializes a new, empty, private node.
- `prepublishDraftNode`: instructs the backend to re-compute the DAG, which is emulated to speed up operations in the drive. This is called automatically in `publishNode`, so in general it doesn't need to be invoked explicitly.
- `listNodes`: list existing nodes for the authenticated user.
- `retrieveDraftFileTree`: get the drive file tree.
- `deleteDraftNode`: remove a draft node.

#### Manifest operations
Pretty self explanatory; these update the top-level metadata fields in the manifest:
- `updateTitle`
- `updateDescription`
- `updateLicense`
- `updateResearchFields`
- `addContributor`
- `removeContributor`

#### File operations
These functions adds, removes, and organizes files in the drive. Everything operates on absolute drive paths; there are no relative-path operations.
- `uploadFiles`: upload one or more local files to the node drive.
- `createNewFolder`: creates an empty folder in the drive, which can be used as a target for uploading/moving files.
- `moveData`: move a file or directory to a new path in the drive. Note that this covers rename operations.
- `deleteData`: delete a path (and its potential subtree) from the drive.

#### External import
These imports automatically create components for attaching metadata, in addition to creating the files in the drive.
- `uploadPdfFromUrl`: let the backend get a PDF from URL and add it to the drive.
- `uploadGithubRepoFromUrl`: let the backend download a snapshot of the repo and add it to the drive.
- `addExternalUnixFsTree`: upload the structure of an external UnixFS tree to the drive, without the actual files. They can then be resolved through regular IPFS means, but the file structure can be browsed in the node.

#### Publishing
Until a publish operation has been run, the entire content of a node is private.
- `publishNode`: publishes said node to the dPID registry on the Görli testnet, and Codex on Ceramic.
- `getDpidHistory`: fetch the dPID registry history, as the backend is aware of it.
- `getManifestDocument`: get the state of the node manifest.
- `addLinkComponent`: create a link to an external resource.
- `addPdfComponent`: create a component for adding metadata to a PDF document in the drive.
- `addCodeComponent`: create a component for adding metadata to code in the drive.
- `deleteComponent`: remove a component from the manifest.
- `addRawComponent`: create a new component in the node.
- `changeManifest`: make an arbitrary change to the manifest.

## Application ideas
Some random ideas of cool stuff you can build with this library:
- A CLI tool for uploading large datasets to nodes
- A tool which parses your ORCiD or Google Scholar profile and creates a node for each publication
- An automatic Node manager which regularly pushes new data to a node and publishes it
- Custom importer, allowing creating nodes from other input formats
