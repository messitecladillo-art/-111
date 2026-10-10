import {
  ACCEPTED_GATE_VALUES,
  ALLOWED_TRANSITIONS,
  BLOCKING_GATE_VALUES,
  CONTROL_CONTRACT_META,
  GATE_DEFINITIONS,
  GATE_NAMES,
  GATE_VALUES,
  PROJECT_STAGES,
} from "@/data/control-plane-contract.generated";
import { CONTROL_CAPABILITIES } from "@/data/control-portal";
import { noStoreJson } from "../_lib/http";

export async function GET() {
  return noStoreJson({
    contract: CONTROL_CONTRACT_META,
    stages: PROJECT_STAGES,
    gates: {
      names: GATE_NAMES,
      values: GATE_VALUES,
      accepted: ACCEPTED_GATE_VALUES,
      blocking: BLOCKING_GATE_VALUES,
      definitions: GATE_DEFINITIONS,
    },
    transitions: ALLOWED_TRANSITIONS,
    capabilities: CONTROL_CAPABILITIES,
  });
}
