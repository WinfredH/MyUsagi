import { Util } from '../src/util';
import { TriggerHub } from '../src/trigger';
import { PetRegistry } from '../src/pets/registry';
import usagi from '../src/pets/usagi';

// Register the default pet so registry tests can look it up by id.
PetRegistry.register(usagi);

export const util = Util;
export const canDispatch = TriggerHub.canDispatch;
export const PetRegistry = PetRegistry;
export { usagi };
