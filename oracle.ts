import type {
  Layout,
  LayoutToType,
  PlatformToChains,
  NamedLayoutItem,
  ProperLayout,
  CustomConversion,
} from "@wormhole-foundation/sdk-base";
import {
  chainToPlatform,
  serializeLayout,
  deserializeLayout,
  calcStaticLayoutSize,
} from "@wormhole-foundation/sdk-base";
import { layoutItems } from "@wormhole-foundation/sdk-definitions";

export const evmFeeParamsLayout = [
  { name: "gasPrice",      binary: "uint", size: 4, /* custom: TODO */ },
  { name: "blobBaseFee",   binary: "uint", size: 4, /* custom: TODO */ },
  { name: "gasTokenPrice", binary: "uint", size: 6, /* custom: TODO */},
] as const satisfies Layout;
const [gasPriceItem, blobBaseFeeItem, gasTokenPriceItem] = evmFeeParamsLayout;

export const solanaFeeParamsLayout = [
  { name: "solanaAccountOverhead", binary: "uint", size: 4, /* custom: TODO */ },
  { name: "solanaSizeCost",        binary: "uint", size: 4, /* custom: TODO */ },
  gasTokenPriceItem,
] as const satisfies Layout;
const [solanaAccountOverheadItem, solanaSizeCostItem] = solanaFeeParamsLayout;

const slotSize = 32;
const rawFeeParamsItem = { binary: "bytes", size: slotSize } as const;
const fullSlotLayout = <const L extends ProperLayout>(layout: L) => [
  ...layout,
  { name: "reserved",
    binary: "bytes",
    custom: new Uint8Array(slotSize - calcStaticLayoutSize(layout)!),
    omit: true
  },
] as const satisfies Layout;

export type EvmFeeParams = LayoutToType<typeof evmFeeParamsLayout>;
export type SolanaFeeParams = LayoutToType<typeof solanaFeeParamsLayout>;

const allowedChains = ["Ethereum", "Solana"] as const;

const chainCommandLayout = [
  { name: "chain", ...layoutItems.chainItem({allowedChains}) },
  { name: "command",
    binary: "switch",
    idSize: 1,
    idTag: "name",
    layouts: [
      [[0, "feeParams"            ], [{ ...rawFeeParamsItem,          name: "value" }]],
      [[1, "gasPrice"             ], [{ ...gasPriceItem,              name: "value" }]],
      [[2, "blobBaseFee"          ], [{ ...blobBaseFeeItem,           name: "value" }]],
      [[3, "gasTokenPrice"        ], [{ ...gasTokenPriceItem,         name: "value" }]],
      [[4, "solanaAccountOverhead"], [{ ...solanaAccountOverheadItem, name: "value" }]],
      [[5, "solanaSizeCost"       ], [{ ...solanaSizeCostItem,        name: "value" }]],
    ]
  }
] as const satisfies Layout;

type ItemToNameValue<T> =
  T extends NamedLayoutItem
  ? { readonly name: T["name"], readonly value: LayoutToType<T> }
  : never;

type ChainCommandRaw = LayoutToType<typeof chainCommandLayout>;
export type ChainCommand = {
  readonly chain: PlatformToChains<"Evm"> & (typeof allowedChains[number]);
  readonly command: |
    { name: "feeParams", value: EvmFeeParams } |
    ItemToNameValue<typeof evmFeeParamsLayout[number]>
  } | {
    readonly chain: PlatformToChains<"Solana"> & (typeof allowedChains[number]);
    readonly command: |
      { name: "feeParams", value: SolanaFeeParams } |
      ItemToNameValue<typeof solanaFeeParamsLayout[number]>
  };

const helper = {
  "Evm": {
    validNames: [...evmFeeParamsLayout.map(item => item.name)] as string[],
    layout: fullSlotLayout(evmFeeParamsLayout),
  },
  "Solana": {
    validNames: [...solanaFeeParamsLayout.map(item => item.name)] as string[],
    layout: fullSlotLayout(solanaFeeParamsLayout),
  },
};

export const priceUpdateLayout = {
  binary: "array",
  lengthSize: 1,
  layout: {
    binary: "bytes",
    layout: chainCommandLayout,
    custom: {
      to: (raw: ChainCommandRaw): ChainCommand => {
        const platform = chainToPlatform(raw.chain);
        if (raw.command.name === "feeParams")
          return {
            chain: raw.chain,
            command: {
              name: "feeParams",
              value: deserializeLayout(helper[platform].layout, raw.command.value)
            }
          } as ChainCommand;
        
        if(!helper[platform].validNames.includes(raw.command.name))
          throw new Error(`Invalid command ${raw.command.name} for ${platform}`);

        return raw as ChainCommand;
      },
      from: (chainCmd: ChainCommand): ChainCommandRaw =>
        (chainCmd.command.name === "feeParams")
          ? {
            chain: chainCmd.chain,
            command: {
              name: "feeParams",
              value: serializeLayout(
                helper[chainToPlatform(chainCmd.chain)].layout,
                chainCmd.command.value
              )
            }
          }
          : chainCmd as ChainCommandRaw
    } satisfies CustomConversion<ChainCommandRaw, ChainCommand>
  }
} as const satisfies Layout;

export type PriceUpdate = LayoutToType<typeof priceUpdateLayout>;

const priceUpdateTest = [
  {
    chain: "Ethereum",
    command: {
      name: "feeParams",
      value: {
        gasPrice: 1,
        blobBaseFee: 2,
        gasTokenPrice: 3,
      }
    }
  },
  {
    chain: "Ethereum",
    command: {
      name: "gasPrice",
      value: 1,
    }
  },
  {
    chain: "Solana",
    command: {
      name: "feeParams",
      value: {
        gasTokenPrice: 1,
        solanaAccountOverhead: 2,
        solanaSizeCost: 3,
      }
    }
  },
  {
    chain: "Solana",
    command: {
      name: "solanaAccountOverhead",
      value: 3,
    }
  },
] as const satisfies ChainCommand[];

const serialized = serializeLayout(priceUpdateLayout, priceUpdateTest);
const deserialized = deserializeLayout(priceUpdateLayout, serialized);
console.log(serialized);
console.log(JSON.stringify(deserialized, null, 2));
