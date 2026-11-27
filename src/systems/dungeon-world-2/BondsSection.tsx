import { useCallback, useMemo, useState } from "react";
import type { Campaign } from "../../campaign/campaign";
import { getCharacter, listCharacters } from "../../features/characters/api";
import { relationshipWeb } from "../../features/characters/relationships";
import type { CharacterView } from "../../features/characters/types";
import { characterLinkTargets } from "../../features/notes/targets";
import { Button } from "../../ui/Button";
import { useQuery } from "../../ui/useQuery";
import { bumpData } from "../../workspace/commands/characters";
import { useCampaign } from "../../workspace/campaignContext";
import { BONDS } from "./bonds";
import { advanceBond, bondsFor, DW2_RELATIONSHIP_DEPTH, forgeBond } from "./bondStore";

const FULL = DW2_RELATIONSHIP_DEPTH.max;

/** A character's Bonds, and for PCs at full Depth with another, forging or reinforcing one. */
export function Dw2Bonds({
  campaign,
  c,
  editable,
}: {
  campaign: Campaign;
  c: CharacterView;
  editable: boolean;
}) {
  const readPeople = useCallback(() => characterLinkTargets(campaign), [campaign]);
  const people = useQuery(campaign.characters, readPeople);
  const readDepthWeb = useCallback(
    () =>
      relationshipWeb(
        campaign.characters,
        listCharacters(campaign).map((person) => person.id),
      ),
    [campaign],
  );
  const depthWeb = useQuery(campaign.characters, readDepthWeb);
  const readBonds = useCallback(
    () => bondsFor(campaign.systemData, c.id),
    [campaign.systemData, c.id],
  );
  const bonds = useQuery(campaign.systemData, readBonds);
  const eligibleBondmates = useMemo(
    () =>
      people.filter((person) => {
        const other = getCharacter(campaign, person.id);
        const ownDepth =
          depthWeb.find(
            (relationship) => relationship.from === c.id && relationship.to === person.id,
          )?.depth ?? 0;
        const theirDepth =
          depthWeb.find(
            (relationship) => relationship.from === person.id && relationship.to === c.id,
          )?.depth ?? 0;
        return person.id !== c.id && other?.kind === "pc" && ownDepth >= FULL && theirDepth >= FULL;
      }),
    [campaign, people, depthWeb, c.id],
  );
  return (
    <>
      {bonds.length > 0 && (
        <ul className="relationships" aria-label="Bonds">
          {bonds.map((bond) => {
            const partnerId = bond.first === c.id ? bond.second : bond.first;
            const partner = getCharacter(campaign, partnerId);
            const advancedMoveIds = new Set(bond.advancedMoves);
            const definition = BONDS.find((entry) => entry.id === bond.type);
            return (
              <li key={`${bond.first}:${bond.second}`} className="relationship">
                <div className="relationship-row">
                  <span className="relationship-name">{partner?.name ?? "Former PC"}</span>
                  <strong>{definition?.name ?? bond.type}</strong>
                </div>
                {definition && (
                  <details className="relationship-bond-rules">
                    <summary>Bond rules</summary>
                    <p>{definition.text}</p>
                    <ul aria-label={`${definition.name} moves`}>
                      {definition.moves.map((move) => (
                        <li key={move.id}>
                          {move.name}:{" "}
                          {move.starting
                            ? "Starting move"
                            : advancedMoveIds.has(move.id)
                              ? "Unlocked"
                              : "Locked"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && eligibleBondmates.length > 0 && (
        <BondForgeForm
          campaign={campaign}
          character={c}
          eligibleBondmates={eligibleBondmates}
          bonds={bonds}
        />
      )}
    </>
  );
}

function BondForgeForm({
  campaign,
  character,
  eligibleBondmates,
  bonds,
}: {
  campaign: Campaign;
  character: CharacterView;
  eligibleBondmates: ReturnType<typeof characterLinkTargets>;
  bonds: ReturnType<typeof bondsFor>;
}) {
  const context = useCampaign();
  const [bondmateId, setBondmateId] = useState("");
  const [bondType, setBondType] = useState("");
  const [bondMoveId, setBondMoveId] = useState("");
  const currentBond = bonds.find(
    (bond) =>
      (bond.first === character.id && bond.second === bondmateId) ||
      (bond.second === character.id && bond.first === bondmateId),
  );
  const reinforcing = currentBond?.type === bondType;
  const advancedMoveIds = new Set(currentBond?.advancedMoves ?? []);
  const definition = BONDS.find((bond) => bond.id === bondType);
  const availableMoves = reinforcing
    ? (definition?.moves.slice(1) ?? []).filter((move) => !advancedMoveIds.has(move.id))
    : [];
  const submit = () => {
    const changed = reinforcing
      ? advanceBond(campaign.systemData, campaign.characters, character.id, bondmateId, bondMoveId)
      : forgeBond(
          campaign.systemData,
          campaign.characters,
          character.id,
          bondmateId,
          bondType,
          (id, xp) => context.execute(bumpData, { id, key: "xp", by: xp }),
        );
    if (changed) {
      setBondmateId("");
      setBondMoveId("");
    }
  };

  return (
    <div className="relationship-bond-controls">
      <label>
        Bondmate
        <select
          value={bondmateId}
          onChange={(event) => {
            setBondmateId(event.currentTarget.value);
            setBondMoveId("");
          }}
        >
          <option value="">Choose a PC</option>
          {eligibleBondmates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Bond
        <select
          aria-label="Bond type"
          value={bondType}
          onChange={(event) => {
            setBondType(event.currentTarget.value);
            setBondMoveId("");
          }}
        >
          <option value="">Choose a Bond</option>
          {BONDS.map((bond) => (
            <option key={bond.id} value={bond.id}>
              {bond.name}
            </option>
          ))}
        </select>
      </label>
      {reinforcing && availableMoves.length > 0 && (
        <label>
          Advanced move
          <select
            value={bondMoveId}
            onChange={(event) => {
              setBondMoveId(event.currentTarget.value);
            }}
          >
            <option value="">Choose a move</option>
            {availableMoves.map((move) => (
              <option key={move.id} value={move.id}>
                {move.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {reinforcing && availableMoves.length === 0 && (
        <span className="muted">All advanced Bond moves are unlocked.</span>
      )}
      <Button
        variant="secondary"
        disabled={!bondmateId || !bondType || (reinforcing && !bondMoveId)}
        onClick={submit}
      >
        {reinforcing ? "Reinforce Bond" : "Forge Bond"}
      </Button>
    </div>
  );
}
