export * from "./integration-registry-legacy";
import { integrationRegistry as definitions } from "./integration-registry-legacy";
export const integrationRegistry=definitions.filter(item=>item.code!=="spree");
