# Nodes integration library
This package allows programmatic interaction with the backend of [DeSci Nodes](https://nodes.desci.com), simplifying creation of research publications by abstracting away a lot of low level detail. In particular, constructing correctly formatted manifest files and handling pinning.


## Core concepts
Some terms are regularly referred to in the code documentation. When programmatically creating nodes, it's important to understand what these things are for the end results to make sense. The corresponding types for these data structures are available in [desci-models](https://github.com/desci-labs/nodes/blob/develop/desci-models/src/ResearchObject.ts).

### The manifest
The data structure of a research object is a JSON file which holds all information for the object,
either directly through constant fields, or indirectly through IPLD or web links.

Here is an example manifest file, we'll go through it piece by piece.
```json
manifest: {
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
### Drafts
A node that's being modified is always in a "draft" state, meaning that the changes are not public. They only become public when the node is published, after which it's possible to view without being authenticated. When new changes are made from this point, they are not publicly available until publish is done again.

Manifests cannot be submitted "whole", as the state of draft manifests are maintained internally as [automerge CRDT documents](https://automerge.org/). Hence, one needs to send change chunks so that the lib submitted changes can be interspersed with simultaneous webapp edits. This means that your calls will more or less instantly be reflected in the webapp.

### Authentication
Most functions require authentication, as they work on your private draft node. You can create an API key under your profile at [nodes.desci.com](https://nodes.desci.com).

## Application ideas
Some random ideas of cool stuff you can build with this library:
- A CLI tool for uploading large datasets to nodes
- A tool which parses your ORCiD or Google Scholar profile and creates a node for each publication
- An automatic Node manager which regularly pushes new data to a node and publishes it
- Custom importer, allowing creating nodes from other input formats
