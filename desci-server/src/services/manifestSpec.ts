import {
  ResearchObjectValidationType,
  ResearchObjectV1Component,
  ResearchObjectV1Validation,
  ResearchObjectV1,
  ResearchObjectV1Attributes,
  ResearchObjectV1Contributor,
  ResearchObjectAttributeKey,
  ResearchObjectV1History,
  ResearchObjectV1Tags,
  ResearchObjectAuthor,
  ResearchObjectV1Organization,
} from '@desci-labs/desci-models';

const components = [
  {
    id: 'QmXjUYF9pfo5UtahMSsb6Fcuo5uJu6rba41Aisegyr3D3A',
    name: 'Research Report',
    type: 'pdf',
    payload: {
      url: 'https://ipfs.desci.com/ipfs/QmXjUYF9pfo5UtahMSsb6Fcuo5uJu6rba41Aisegyr3D3A',
      annotations: [
        {
          startX: 0.217,
          startY: 0.3,
          endX: 0.787,
          endY: 0.534,
          pageIndex: 1,
          id: '3add6235-9193-4cc0-9f9f-85487a013e7e',
          title: 'Learn more about trusted ceremonies',
          text: 'How are trusted ceremonies organised in practice? Why are they important?\n\n\n[Watch Zcash Ceremony](https://www.youtube.com/watch?v=D6dY-3x3teM)\n\n\nFor a more in-depth technical dive, here is a good primer: [Setup Ceremonies - ZKProof Standards](https://zkproof.org/2021/06/30/setup-ceremonies/)',
        },
        {
          startX: 0.25,
          startY: 0.507,
          endX: 0.77,
          endY: 0.688,
          pageIndex: 9,
          id: 'zzba05c79-1cf0-4dab-bc72-465d7bb480fe',
          title: 'Setup alternate derivation',
          text: `The hashing guarantees of the set up are alternatively modeled using an integral\n$$$
  \\\\f(\\relax{x}) = \\int_{-\\infty}^\\infty\\hat\\xi\,e^{2 \\pi i \\xi x}\\,d\\xi
  $$$
  `,
        },
        {
          startX: 0.3125,
          startY: 0.15,
          endX: 0.69,
          endY: 0.35,
          pageIndex: 15,
          id: 'ba055c79-1cf0-4dab-bc72-465d7bb480fe',
          title: 'Reproduce Fig. 2',
          text: 'To replicate the benchmarking results shown Fig. 2, execute the script [GenerateFig2](#/code/yurjhff/) following the readme setup instructions. Note that in order to ease the computational load and facilitate reproducibility, the script runs only a subset of the total proofs verified.',
        },
      ],
    },
  },
  {
    id: 'yurjhff',
    name: 'SnarkPack Code & Tests',
    type: 'code',
    payload: {
      language: 'rust',
      code: ``,
    },
  },
  {
    id: 'QmQLMJiZm1hD1cRbPJEP98HZJXi6ujfLkTrGEjDkErwakk',
    name: 'Result Presentation Deck',
    type: 'pdf',
    payload: {
      url: 'https://ipfs.desci.com/ipfs/QmQLMJiZm1hD1cRbPJEP98HZJXi6ujfLkTrGEjDkErwakk',
      annotations: [],
    },
  },
  {
    id: 'QmWNVcixEybLctzmQYtSumjTP49fGUo3dBACtanCbt1whM',
    name: 'Video Presentation',
    type: 'video',
    payload: {
      url: 'https://www.youtube.com/watch?v=anlJsxEj-Zc',
    },
  },
  {
    id: 'QmXn3cnbrLA2f1gTrzBuw2xURpMUGV7U81oe6y7ZUCajvU',
    name: 'Supplemental information',
    type: 'pdf',
    payload: {
      url: 'https://ipfs.desci.com/ipfs/QmXn3cnbrLA2f1gTrzBuw2xURpMUGV7U81oe6y7ZUCajvU',
      annotations: [],
    },
  },
] as ResearchObjectV1Component[];

const validations = [
  {
    type: ResearchObjectValidationType.CONFERENCE,
    title: 'Conference proceeding',
    subtitle: 'Financial cryptography and data security',
    transactionId: '819h51228951uiba9',
    tokenId: '24',
    contractAddress: '0x0123959125129a',
    url: 'https://cloudflare-ipfs.com/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki',
    deposits: [
      {
        token: 'ETH',
        address: '0x0',
        amount: '3.494',
      },
    ],
  },
  {
    type: ResearchObjectValidationType.REVIEW,
    title: 'John Daily',
    subtitle: 'Attribute Certifier',
    transactionId: '819h51228951uiba1',
    tokenId: '25',
    contractAddress: '0x0123959125129a',
    url: 'https://cloudflare-ipfs.com/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki',
    deposits: [
      {
        token: 'ETH',
        address: '0x0',
        amount: '0.528',
      },
    ],
  },
] as ResearchObjectV1Validation[];

const attributes: ResearchObjectV1Attributes[] = [
  {
    key: ResearchObjectAttributeKey.ACM_AVAILABLE,
    value: true,
  },
  {
    key: ResearchObjectAttributeKey.ACM_FUNCTIONAL,
    value: true,
  },
  {
    key: ResearchObjectAttributeKey.ACM_REUSABLE,
    value: true,
  },
  {
    key: ResearchObjectAttributeKey.ACM_REPRODUCED,
    value: false,
  },
  {
    key: ResearchObjectAttributeKey.ACM_REPLICATED,
    value: false,
  },
];

const authors: { [key: string]: ResearchObjectAuthor } = {
  john: {
    id: 'John Daily',
    name: 'John Daily',
    orcid: 'John Daily',
  },
  mary: {
    id: 'Mary Maller',
    name: 'Mary Maller',
    orcid: 'Mary Maller',
  },
  nicolas: {
    id: 'Nicolas Gailly',
    name: 'Nicolas Gailly',
    orcid: 'Nicolas Gailly',
  },
  anca: {
    id: 'Anca Nitulescu',
    name: 'Anca Nitulescu',
    orcid: 'Anca Nitulescu',
  },
};

const contributors: ResearchObjectV1Contributor[] = [
  { title: 'Author', author: authors.nicolas },
  { title: 'Author', author: authors.mary },
  { title: 'Author', author: authors.anca },
];

const history: ResearchObjectV1History[] = [
  {
    title: '01-06-2021',
    author: authors.john,
    content: `Attributes certified (invited)
  * Certified Artifacts available
  * Certified Artifacts verified
  * Certified Artifacts reusable`,
  },
  {
    title: '28-05-2021',
    author: authors.john,
    content: `Attributes
  * Certified Artifacts available
  * Certified Artifacts verified
  * Certified Artifacts reusable`,
  },
  {
    title: '17-05-2021',
    author: authors.mary,
    content: `## Components
  * Add SnarkPack code & tests
  * Add Results presentation deck
  * Add Video presentation
  * Add Annotations`,
  },
  {
    title: '13-05-2021',
    author: authors.nicolas,
    content: `Components
  
  * Add Research report`,
  },
];

const tags: ResearchObjectV1Tags[] = [
  {
    name: 'Research Article',
  },
  {
    name: 'Cryptology',
  },
  {
    name: 'zk-SNARK',
  },
  {
    name: 'Scaling',
  },
];

const organizations: ResearchObjectV1Organization[] = [
  {
    name: 'Protocol Labs Research',
    subtext: 'CryptoNetLab',
    url: 'https://research.protocol.ai/groups/cryptonetlab',
  },
];

const researchObject: ResearchObjectV1 = {
  version: 1,
  validations,
  contributors,
  attributes,
  components,
  history,
  tags,
  organizations,
};

export const createResearchObjectManifest = () => {
  return researchObject;
};