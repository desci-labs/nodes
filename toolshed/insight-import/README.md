# Insight Importer
This project contains tools for importing publications from Insight Journal to Nodes. The method might be useful for other imports, where there is static data for publication history that should be reflected in the history of new nodes.

## Method
An external git repo contains a metadata manifest, and optionally a cover image, for each publication. This _roughly_ corresponds to the ResearchoObject schema, but needs transforming. `sync.sh` grabs information from this repo, grabs referenced CIDs to articles, code and/or data, and the node scripts wrangles them into functional nodes with `nodes-lib`.

### Data fetching
These `metadata.json` files contain CIDs for article PDFs and code/data, per version, so the data necessary isn't contained in the repo. [`sync.sh`](./sync.sh) tries its best to filter out these CIDs and find them with `lassie`. Each parsed CID is saved as a CAR file in `local-data/publications/[pub_id]/data/[cid].car`.

The output format looks like this:

```
 local-data
├──  issues
│   ├──  1.json
│   ├──  156.json
│   ├──  157.json
│   ├──  162.json
│   ├──  166.json
│   ┆
│
└──  publications
    ├──  10
    │   ├──  data
    │   └──  metadata.json
    ├──  100
    │   ├──  data
    │   │   ├──  bafkreiapmd5yggqcwz6y4rn36jc2vl4vrbsgmky5zfp6qhijxcx66euhqq.car
    │   │   └──  bafybeidgy7vukjtct2k5frg4xniysw42z3hjeyltgbon5flhzcxxggxi4i.car
    │   └──  metadata.json
    ├──  101
    │   ├──  data
    │   │   ├──  bafybeiag66br4oux64p3q2eujsl7fja2gbexuzathv3nzyfxvxq2ep6oci.car
    │   │   └──  bafybeihxuqhw7weuaabwjsc6ybrcaep24c7cojxy527x5khhzv34oiefxy.car
    │   └──  metadata.json
    ├──  102
    │   ├──  cover.jpeg
    │   ├──  data
    │   │   └──  bafkreidu4gqkzqxnbcwoncpwzlyp4fiheip5loo7ok3hvahqyf3t2byjlq.car
    │   └──  metadata.json
    ┆
```

Some notes:
- Not all publications have associated files (55, 424, ...)
- Not all have cover images (321, )
- If a publication has a data directory, there should be at least one CAR file in it.

### Node creation
