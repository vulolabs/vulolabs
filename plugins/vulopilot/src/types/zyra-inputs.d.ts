// '@zyra/inputs' as tsconfig.json resolves it: zyra's own exports, with the types corrected to what its runtime does.
// - InputRenderer's types still require `proSetting` and `modules`, which the component no longer reads (it takes
//   the active modules from zyra's own module store).
// Remove an entry here once zyra's published types match.
import type { ComponentProps, FC } from 'react';
import type { InputRenderer as ZyraInputRenderer } from '@multivendorx/zyra';

export * from '@multivendorx/zyra';

export declare const InputRenderer: FC<Omit<ComponentProps<typeof ZyraInputRenderer>, 'proSetting' | 'modules'>>;
