"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bell,
  Bot,
  Clock3,
  Cloud,
  CloudOff,
  Coins,
  Copy,
  Dna,
  Fence,
  Gem,
  Globe2,
  Hammer,
  House,
  Package,
  Palette,
  PawPrint,
  Search,
  Sparkles,
  Star,
  WandSparkles,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import {
  BORDERS,
  BORDER_SUMMON_COST,
  RANK_ORDER,
  SPECIES,
  STAR_GACHA_COST,
  SUMMON_COST,
  TEN_PULL_COST,
  UPGRADES,
  VARIANTS,
  animalIncomePerMinute,
  animalLevelCost,
  autoPlaceBestAnimals,
  claimableIncome,
  createInitialGameState,
  farmIncomePerMinute,
  farmSlotCount,
  migrateGameState,
  totalFarmMultiplier,
  upgradeCost,
  type AnimalInstance,
  type BorderId,
  type GameState,
  type Rank,
  type SpeciesId,
  type UpgradeId,
  type VariantId,
} from "../src/domain/game";
import type {
  GameAction,
  GameActionEvent,
} from "../src/domain/server-actions";

type View = "farm" | "summon" | "animals" | "merge" | "upgrades" | "visit";
type Machine = "meadow" | "starfall" | "border";
type Result =
  | { kind: "animal"; animal: AnimalInstance }
  | { kind: "batch"; animals: AnimalInstance[]; newSpecies: SpeciesId[] }
  | { kind: "border"; borderId: BorderId; duplicate: boolean };
type CollectionSort = "income" | "potential" | "newest" | "name";
type CollectionStatus = "all" | "active" | "stored" | "locked";
type ActionTone = "earn" | "spend" | "magic" | "success";
type SummonReveal = {
  key: number;
  rarity: Rank;
  label: string;
  animals?: AnimalInstance[];
  borderId?: BorderId;
};
type MergeReveal = {
  key: number;
  parents: AnimalInstance[];
  offspring: AnimalInstance;
};
type CloudStatus = "connecting" | "synced" | "saving" | "local" | "error";
type OnlineProfile = {
  displayName: string;
  visitCode: string;
  createdAt: number;
  updatedAt: number;
};
type PublicFarmAnimal = {
  speciesId: SpeciesId;
  variant: VariantId;
  level: number;
  potential: number;
  activeSlot: number | null;
};
type PublicFarm = {
  displayName: string;
  visitCode: string;
  activeBorder: BorderId;
  coins: number;
  incomeRate: number;
  animalCount: number;
  speciesCount: number;
  activeAnimals: PublicFarmAnimal[];
  updatedAt: number;
};

const STORAGE_KEY = "gachafarm.prototype.v1";
const statLabels = {
  yieldStat: "Yield",
  tempoStat: "Tempo",
  fortune: "Fortune",
  heritage: "Heritage",
} as const;
const variantRevealRank: Record<VariantId, Rank> = {
  natural: "Common",
  bronze: "Rare",
  golden: "Epic",
  diamond: "Legendary",
  mystic: "Mythic",
};
const navigation: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "farm", label: "Farm", icon: House },
  { id: "summon", label: "Summon", icon: Bell },
  { id: "animals", label: "Animals", icon: PawPrint },
  { id: "merge", label: "Merge", icon: Dna },
  { id: "upgrades", label: "Upgrade", icon: Hammer },
  { id: "visit", label: "Visit", icon: Globe2 },
];
const upgradeIcons: Record<UpgradeId, LucideIcon> = {
  habitat: House,
  production: Wheat,
  offline: Clock3,
  luck: Sparkles,
};
const grandSummonStarPositions = [8, 25, 43, 61, 79, 16, 34, 52, 70, 88];

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
function animalName(animal: AnimalInstance) {
  return `${VARIANTS[animal.variant].name} ${SPECIES[animal.speciesId].name}`;
}
function perSecondIncome(animal: AnimalInstance, multiplier: number) {
  const value = (animalIncomePerMinute(animal) * multiplier) / 60;
  return value < 1 ? value.toFixed(2) : value.toFixed(1);
}
function animalRevealRank(animal: AnimalInstance) {
  const speciesRank = SPECIES[animal.speciesId].rank;
  const variantRank = variantRevealRank[animal.variant];
  return RANK_ORDER.indexOf(speciesRank) >= RANK_ORDER.indexOf(variantRank)
    ? speciesRank
    : variantRank;
}
function statDifference(value: number, comparison?: number) {
  if (comparison === undefined) return "";
  const difference = value - comparison;
  return difference === 0
    ? "±0"
    : difference > 0
      ? `+${difference}`
      : `${difference}`;
}
function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

async function uploadCloudState(state: GameState) {
  const response = await fetch("/api/cloud-save", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const data = (await response.json()) as { savedAt?: number; error?: string };
  if (!response.ok || !data.savedAt) throw new Error(data.error || "Cloud save failed.");
  return data.savedAt;
}

async function requestGameAction(action: GameAction) {
  const actionId = newId(action.type);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/game-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, action }),
      });
      const data = (await response.json()) as {
        state?: unknown;
        event?: GameActionEvent;
        savedAt?: number;
        error?: string;
      };
      if (!response.ok || !data.event || !data.savedAt) {
        throw new Error(data.error || "The farm could not finish that action.");
      }
      const state = migrateGameState(data.state, Date.now());
      if (!state) throw new Error("The server returned an invalid farm state.");
      return { state, event: data.event, savedAt: data.savedAt };
    } catch (error) {
      lastError = error;
      if (error instanceof Error && !/fetch|network|load/i.test(error.message)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The farm could not finish that action.");
}

function CreatureArt({
  speciesId,
  variant,
  size = "medium",
  animated = false,
}: {
  speciesId: SpeciesId;
  variant?: AnimalInstance["variant"];
  size?: "small" | "medium" | "large" | "hero";
  animated?: boolean;
}) {
  const index = SPECIES[speciesId].atlasIndex;
  const column = index % 3;
  const row = Math.floor(index / 3);
  return (
    <span
      className={`creature-art art-${size} ${variant ? `art-${variant}` : ""} ${animated ? "active-creature-art" : ""}`}
      role="img"
      aria-label={`${variant ? `${VARIANTS[variant].name} ` : ""}${SPECIES[speciesId].name}`}
    >
      <span
        className="creature-sprite"
        style={{ backgroundPosition: `${column * 50}% ${row * 50}%` }}
      />
    </span>
  );
}

function StatGrid({
  animal,
  comparison,
}: {
  animal: AnimalInstance;
  comparison?: AnimalInstance;
}) {
  return (
    <div className="stat-grid">
      {(Object.keys(statLabels) as (keyof typeof statLabels)[]).map((stat) => (
        <div key={stat}>
          <span>{statLabels[stat]}</span>
          <strong>{animal[stat]}</strong>
          {comparison && (
            <em>{statDifference(animal[stat], comparison[stat])}</em>
          )}
        </div>
      ))}
    </div>
  );
}

function AnimalCard({
  animal,
  selected,
  valueRank,
  onSelect,
}: {
  animal: AnimalInstance;
  selected: boolean;
  valueRank: number;
  onSelect: () => void;
}) {
  const species = SPECIES[animal.speciesId];
  return (
    <article className={`animal-info-card ${selected ? "selected" : ""}`}>
      <div className="card-badges">
        <span className={`value-badge ${valueRank === 1 ? "top-value" : ""}`}>
          {valueRank === 1 ? "♛ Top income" : `Value #${valueRank}`}
        </span>
        <span className={`rank-badge ${species.rank.toLowerCase()}`}>
          {species.rank}
        </span>
        <span className={`variant-badge ${animal.variant}`}>
          {VARIANTS[animal.variant].name}
        </span>
        {animal.locked && <span className="state-badge">Locked</span>}
      </div>
      <div className="animal-identity">
        <CreatureArt
          speciesId={animal.speciesId}
          variant={animal.variant}
          size="medium"
        />
        <div>
          <h3>{species.name}</h3>
          <p>
            Level {animal.level} · Potential {animal.potential}
          </p>
        </div>
      </div>
      <div className="production-strip">
        <span>Production</span>
        <strong>+{animalIncomePerMinute(animal)} coins/min</strong>
      </div>
      <StatGrid animal={animal} />
      <div className="card-footer">
        <span>
          {animal.activeSlot === null
            ? "In storage"
            : `Active · Habitat ${animal.activeSlot + 1}`}
        </span>
        <button type="button" onClick={onSelect}>
          {selected ? "Selected" : "View details"}
        </button>
      </div>
    </article>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState(0));
  const [view, setView] = useState<View>("farm");
  const [machine, setMachine] = useState<Machine>("meadow");
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState(
    "Welcome to your first GachaFarm prototype.",
  );
  const [result, setResult] = useState<Result | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animalDetailOpen, setAnimalDetailOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [borderPickerOpen, setBorderPickerOpen] = useState(false);
  const [farmAnimalId, setFarmAnimalId] = useState<string | null>(null);
  const [slotPicker, setSlotPicker] = useState<number | null>(null);
  const [movingAnimalId, setMovingAnimalId] = useState<string | null>(null);
  const [draggingAnimalId, setDraggingAnimalId] = useState<string | null>(null);
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([]);
  const [isSummoning, setIsSummoning] = useState(false);
  const [summonReveal, setSummonReveal] = useState<SummonReveal | null>(null);
  const [mergeReveal, setMergeReveal] = useState<MergeReveal | null>(null);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionSort, setCollectionSort] =
    useState<CollectionSort>("income");
  const [rankFilter, setRankFilter] = useState<"all" | Rank>("all");
  const [variantFilter, setVariantFilter] = useState<"all" | VariantId>("all");
  const [statusFilter, setStatusFilter] = useState<CollectionStatus>("all");
  const [actionFeedback, setActionFeedback] = useState<{
    key: number;
    icon: string;
    text: string;
    tone: ActionTone;
  } | null>(null);
  const [upgradingId, setUpgradingId] = useState<UpgradeId | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("connecting");
  const [cloudLastSaved, setCloudLastSaved] = useState<number | null>(null);
  const [onlineProfile, setOnlineProfile] = useState<OnlineProfile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [visitQuery, setVisitQuery] = useState("");
  const [visitResults, setVisitResults] = useState<PublicFarm[]>([]);
  const [visitedFarm, setVisitedFarm] = useState<PublicFarm | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);
  const [serverActionPending, setServerActionPending] = useState(false);
  const cloudReadyRef = useRef(false);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const serverActionPendingRef = useRef(false);

  useEffect(() => {
    const currentTime = Date.now();
    const saved = localStorage.getItem(STORAGE_KEY);
    let next = createInitialGameState(currentTime);
    let welcomeMessage: string | null = null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { version?: number };
        next = migrateGameState(parsed, currentTime) ?? next;
        if ((parsed.version ?? 0) < 3)
          welcomeMessage =
            "Core Game Alpha unlocked! Your farm received a 5,000 coin launch grant.";
      } catch {
        /* use fresh state */
      }
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setGame(next);
    setNow(currentTime);
    setHydrated(true);
    if (welcomeMessage) setMessage(welcomeMessage);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    async function connectCloud() {
      setCloudStatus("connecting");
      try {
        const response = await fetch("/api/player", { cache: "no-store" });
        const data = (await response.json()) as {
          profile?: OnlineProfile;
          save?: { state: unknown; updatedAt: number } | null;
          error?: string;
        };
        if (!response.ok || !data.profile) throw new Error(data.error || "Cloud profile unavailable.");
        if (cancelled) return;
        setOnlineProfile(data.profile);
        setProfileName(data.profile.displayName);
        if (data.save) {
          const cloudState = migrateGameState(data.save.state, Date.now());
          if (cloudState) {
            setGame(cloudState);
            setCloudLastSaved(data.save.updatedAt);
            setMessage("Cloud farm restored. Your progress now follows your account.");
          }
        } else {
          const saved = localStorage.getItem(STORAGE_KEY);
          const localState = saved
            ? migrateGameState(JSON.parse(saved) as unknown, Date.now())
            : null;
          const savedAt = await uploadCloudState(localState ?? createInitialGameState(Date.now()));
          if (cancelled) return;
          setCloudLastSaved(savedAt);
          setMessage("Browser farm migrated to your new cloud save.");
        }
        cloudReadyRef.current = true;
        setCloudStatus("synced");
      } catch (error) {
        console.error("cloud bootstrap failed", error);
        if (!cancelled) {
          cloudReadyRef.current = false;
          setCloudStatus("local");
          setMessage("Playing with a local save. Cloud connection will retry next visit.");
        }
      }
    }
    void connectCloud();
    return () => { cancelled = true; };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !onlineProfile || !cloudReadyRef.current) return;
    if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    setCloudStatus("saving");
    cloudSaveTimerRef.current = window.setTimeout(() => {
      void uploadCloudState(game)
        .then((savedAt) => {
          setCloudLastSaved(savedAt);
          setCloudStatus("synced");
        })
        .catch((error) => {
          console.error("automatic cloud save failed", error);
          setCloudStatus("error");
        });
    }, 1200);
    return () => {
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    };
  }, [game, hydrated, onlineProfile]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const farmSlots = farmSlotCount(game);
  const activeAnimals = useMemo(
    () =>
      Array.from(
        { length: farmSlots },
        (_, slot) =>
          game.animals.find((animal) => animal.activeSlot === slot) ?? null,
      ),
    [farmSlots, game.animals],
  );
  const storageAnimals = game.animals.filter(
    (animal) => animal.activeSlot === null,
  );
  const storageByIncome = useMemo(
    () =>
      game.animals
        .filter((animal) => animal.activeSlot === null)
        .sort((a, b) => animalIncomePerMinute(b) - animalIncomePerMinute(a)),
    [game.animals],
  );
  const activeBorder = BORDERS[game.activeBorder];
  const farmMultiplier = totalFarmMultiplier(game);
  const incomeRate = farmIncomePerMinute(game.animals, farmMultiplier);
  const pendingIncome = now > 0 ? claimableIncome(game, now) : 0;
  const selectedAnimal =
    game.animals.find((animal) => animal.id === selectedId) ?? null;
  const farmAnimal =
    game.animals.find((animal) => animal.id === farmAnimalId) ?? null;
  const comparisonAnimal = selectedAnimal
    ? game.animals
        .filter(
          (animal) =>
            animal.id !== selectedAnimal.id &&
            animal.speciesId === selectedAnimal.speciesId,
        )
        .sort((a, b) => animalIncomePerMinute(b) - animalIncomePerMinute(a))[0]
    : undefined;
  const mergeEligible = game.animals.filter(
    (animal) => !animal.locked && animal.activeSlot === null,
  );
  const selectedMergeAnimals = selectedMergeIds
    .map((id) => game.animals.find((animal) => animal.id === id))
    .filter((animal): animal is AnimalInstance => Boolean(animal));
  const mergeTemplate = selectedMergeAnimals[0];
  const compatibleMergeCount = mergeTemplate
    ? mergeEligible.filter(
        (animal) =>
          animal.speciesId === mergeTemplate.speciesId &&
          animal.variant === mergeTemplate.variant,
      ).length
    : 0;
  const incomeValueRank = useMemo(
    () =>
      new Map(
        [...game.animals]
          .sort(
            (a, b) =>
              animalIncomePerMinute(b) - animalIncomePerMinute(a) ||
              b.potential - a.potential,
          )
          .map((animal, index) => [animal.id, index + 1]),
      ),
    [game.animals],
  );
  const visibleAnimals = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    const filtered = game.animals.filter((animal) => {
      const species = SPECIES[animal.speciesId];
      if (query && !animalName(animal).toLowerCase().includes(query))
        return false;
      if (rankFilter !== "all" && species.rank !== rankFilter) return false;
      if (variantFilter !== "all" && animal.variant !== variantFilter)
        return false;
      if (statusFilter === "active" && animal.activeSlot === null) return false;
      if (statusFilter === "stored" && animal.activeSlot !== null) return false;
      if (statusFilter === "locked" && !animal.locked) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (collectionSort === "potential")
        return (
          b.potential - a.potential ||
          animalIncomePerMinute(b) - animalIncomePerMinute(a)
        );
      if (collectionSort === "newest") return b.createdAt - a.createdAt;
      if (collectionSort === "name")
        return animalName(a).localeCompare(animalName(b));
      return (
        animalIncomePerMinute(b) - animalIncomePerMinute(a) ||
        b.potential - a.potential
      );
    });
  }, [
    collectionSearch,
    collectionSort,
    game.animals,
    rankFilter,
    statusFilter,
    variantFilter,
  ]);

  function showAction(
    icon: string,
    text: string,
    tone: ActionTone = "success",
  ) {
    setActionFeedback({ key: Date.now(), icon, text, tone });
  }

  async function runAuthoritativeAction(action: GameAction) {
    if (!onlineProfile || !cloudReadyRef.current) {
      throw new Error("Connect your cloud farm before using protected game actions.");
    }
    if (serverActionPendingRef.current) {
      throw new Error("Your previous farm action is still finishing.");
    }
    serverActionPendingRef.current = true;
    setServerActionPending(true);
    setCloudStatus("saving");
    try {
      const result = await requestGameAction(action);
      setGame(result.state);
      setCloudLastSaved(result.savedAt);
      setCloudStatus("synced");
      return result.event;
    } catch (error) {
      setCloudStatus("error");
      throw error;
    } finally {
      serverActionPendingRef.current = false;
      setServerActionPending(false);
    }
  }

  async function claimIncome() {
    if (pendingIncome <= 0) {
      setMessage("Your animals are still gathering coins.");
      return;
    }
    try {
      const event = await runAuthoritativeAction({ type: "claim-income" });
      if (event.type !== "income-claimed") return;
      setMessage(`Collected ${event.amount.toLocaleString()} trusted idle coins.`);
      showAction("●", `+${event.amount.toLocaleString()} coins collected`, "earn");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Income claim failed.");
    }
  }

  async function addTestCurrency() {
    try {
      const event = await runAuthoritativeAction({ type: "grant-test-currency" });
      if (event.type !== "test-currency-granted") return;
      setMessage("Protected alpha test grant added 100,000 coins.");
      showAction("●", "+100,000 test coins", "earn");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test grant failed.");
    }
  }

  async function saveCloudNow() {
    if (!onlineProfile) {
      setMessage("Cloud profile is not connected yet.");
      return;
    }
    setCloudStatus("saving");
    try {
      const savedAt = await uploadCloudState(game);
      setCloudLastSaved(savedAt);
      setCloudStatus("synced");
      setMessage("Farm saved to the cloud.");
      showAction("●", "Cloud save complete", "success");
    } catch {
      setCloudStatus("error");
      setMessage("Cloud save failed. Your browser save is still safe.");
    }
  }

  async function updateOnlineProfile() {
    if (!onlineProfile) return;
    try {
      const response = await fetch("/api/player", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: profileName }),
      });
      const data = (await response.json()) as { profile?: OnlineProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Profile update failed.");
      setOnlineProfile(data.profile);
      setProfileName(data.profile.displayName);
      setMessage(`Online farm renamed to ${data.profile.displayName}.`);
      showAction("●", "Farm profile updated", "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile update failed.");
    }
  }

  async function searchOnlineFarms() {
    const query = visitQuery.trim();
    if (!query) {
      setMessage("Enter a farmer name or visit code first.");
      return;
    }
    setVisitLoading(true);
    try {
      const response = await fetch(`/api/farms?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = (await response.json()) as { farms?: PublicFarm[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Farm search failed.");
      const farms = data.farms ?? [];
      setVisitResults(farms);
      setVisitedFarm(farms[0] ?? null);
      setMessage(farms.length ? `${farms.length} online farm${farms.length === 1 ? "" : "s"} found.` : "No online farms matched that name or code.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Farm search failed.");
    } finally {
      setVisitLoading(false);
    }
  }

  async function copyVisitCode() {
    if (!onlineProfile) return;
    try {
      await navigator.clipboard.writeText(onlineProfile.visitCode);
      setMessage(`Visit code ${onlineProfile.visitCode} copied.`);
      showAction("●", "Visit code copied", "success");
    } catch {
      setMessage(`Your visit code is ${onlineProfile.visitCode}.`);
    }
  }

  function placeAnimalInSlot(animalId: string, slot: number) {
    const target = game.animals.find((animal) => animal.id === animalId);
    if (!target) return;
    const occupant = game.animals.find(
      (animal) => animal.activeSlot === slot && animal.id !== animalId,
    );
    const previousSlot = target.activeSlot;
    setGame((current) => ({
      ...current,
      animals: current.animals.map((animal) => {
        if (animal.id === animalId) return { ...animal, activeSlot: slot };
        if (occupant && animal.id === occupant.id)
          return { ...animal, activeSlot: previousSlot };
        return animal;
      }),
    }));
    setMessage(
      occupant
        ? `${animalName(target)} swapped habitats with ${animalName(occupant)}.`
        : `${animalName(target)} moved into habitat ${slot + 1}.`,
    );
    showAction("↔", occupant ? "Habitats swapped" : "Creature placed");
    setMovingAnimalId(null);
    setSlotPicker(null);
    setFarmAnimalId(null);
  }

  function handleFarmSlot(slot: number, animal: AnimalInstance | null) {
    if (movingAnimalId) {
      placeAnimalInSlot(movingAnimalId, slot);
      return;
    }
    if (animal) setFarmAnimalId(animal.id);
    else setSlotPicker(slot);
  }

  function storeAnimal(animalId: string) {
    const animal = game.animals.find((item) => item.id === animalId);
    setGame((current) => ({
      ...current,
      animals: current.animals.map((item) =>
        item.id === animalId ? { ...item, activeSlot: null } : item,
      ),
    }));
    if (animal) setMessage(`${animalName(animal)} moved to storage.`);
    if (animal) showAction("📦", "Moved to storage");
    setFarmAnimalId(null);
    setMovingAnimalId(null);
  }

  function beginMove(animalId: string) {
    setFarmAnimalId(null);
    setMovingAnimalId(animalId);
    setMessage("Move mode: click any habitat to place or swap this animal.");
  }

  function startAnimalDrag(event: DragEvent<HTMLElement>, animalId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", animalId);
    setDraggingAnimalId(animalId);
  }

  function dropAnimalInSlot(event: DragEvent<HTMLElement>, slot: number) {
    event.preventDefault();
    const animalId =
      draggingAnimalId || event.dataTransfer.getData("text/plain");
    if (animalId) placeAnimalInSlot(animalId, slot);
    setDraggingAnimalId(null);
  }

  function dropAnimalInStorage(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const animalId =
      draggingAnimalId || event.dataTransfer.getData("text/plain");
    if (animalId) storeAnimal(animalId);
    setDraggingAnimalId(null);
  }

  function autoPlaceFarm() {
    setGame((current) => ({
      ...current,
      animals: autoPlaceBestAnimals(current.animals, farmSlotCount(current)),
    }));
    setFarmAnimalId(null);
    setMovingAnimalId(null);
    setDraggingAnimalId(null);
    setMessage(
      `Auto Place selected your ${Math.min(farmSlots, game.animals.length)} highest-producing animals.`,
    );
    showAction("🪄", "Best-income farm assembled", "magic");
  }

  async function performSummon(quantity: 1 | 10 = 1) {
    const pullCount = machine === "meadow" ? quantity : 1;
    const cost =
      machine === "meadow"
        ? pullCount === 10
          ? TEN_PULL_COST
          : SUMMON_COST
        : machine === "starfall"
          ? STAR_GACHA_COST
          : BORDER_SUMMON_COST;
    const balance =
      machine === "meadow"
        ? game.coins
        : machine === "starfall"
          ? game.discoveryStars
          : game.fusionDust;
    const currencyName =
      machine === "meadow"
        ? "coins"
        : machine === "starfall"
          ? "Discovery Stars"
          : "Fusion Dust";
    if (balance < cost || isSummoning || serverActionPending) {
      setMessage(
        `You need ${cost.toLocaleString()} ${currencyName} for this machine.`,
      );
      return;
    }
    setIsSummoning(true);
    setSummonReveal(null);
    setMessage("The bell is answering…");
    try {
      const event = await runAuthoritativeAction({ type: "summon", machine, quantity });
      if (event.type === "creatures-summoned") {
        const pulledAnimals = event.animals;
        const newSpecies = event.newSpecies;
      const nextResult: Result =
        pullCount === 1
          ? { kind: "animal", animal: pulledAnimals[0] }
          : { kind: "batch", animals: pulledAnimals, newSpecies };
      const bestAnimal = [...pulledAnimals].sort(
        (a, b) =>
          RANK_ORDER.indexOf(animalRevealRank(b)) -
          RANK_ORDER.indexOf(animalRevealRank(a)),
      )[0];
      const revealRank = animalRevealRank(bestAnimal);
      const variantOutranksSpecies =
        RANK_ORDER.indexOf(variantRevealRank[bestAnimal.variant]) >
        RANK_ORDER.indexOf(SPECIES[bestAnimal.speciesId].rank);
      const revealLabel =
        pullCount === 10
          ? `Grand summon · ${revealRank} highlight`
          : variantOutranksSpecies
            ? `${VARIANTS[bestAnimal.variant].name} variant`
            : `${revealRank} creature`;
      window.setTimeout(() => {
        setSummonReveal({
          key: Date.now(),
          rarity: revealRank,
          label: revealLabel,
          animals: pulledAnimals,
        });
        setMessage(`${revealRank} constellation detected…`);
        window.setTimeout(() => {
          setResult(nextResult);
          if (pullCount === 1) setSelectedId(pulledAnimals[0].id);
          setSummonReveal(null);
          setIsSummoning(false);
          setMessage(
            pullCount === 10
              ? `Ten creatures answered. ${newSpecies.length ? `${newSpecies.length} new species discovered!` : "Collection expanded."}`
              : `${animalName(pulledAnimals[0])} answered the bell.`,
          );
        }, 3200);
      }, 750);
      } else if (event.type === "border-summoned") {
      const duplicate = event.duplicate;
      const nextResult: Result = {
        kind: "border",
        borderId: event.borderId,
        duplicate,
      };
      const revealRank = BORDERS[event.borderId].rarity as Rank;
      window.setTimeout(() => {
        setSummonReveal({
          key: Date.now(),
          rarity: revealRank,
          label: `${revealRank} farm border`,
          borderId: event.borderId,
        });
        setMessage(`${revealRank} border sigil detected…`);
        window.setTimeout(() => {
          setResult(nextResult);
          setSummonReveal(null);
          setIsSummoning(false);
          setMessage(
            duplicate
              ? `Duplicate ${BORDERS[event.borderId].name} became 15 Fusion Dust.`
              : `${BORDERS[event.borderId].name} joined your border collection.`,
          );
        }, 3200);
      }, 750);
      }
    } catch (error) {
      setSummonReveal(null);
      setIsSummoning(false);
      setMessage(error instanceof Error ? error.message : "The summon could not be completed.");
    }
  }

  function toggleLock(animalId: string) {
    setGame((current) => ({
      ...current,
      animals: current.animals.map((animal) =>
        animal.id === animalId ? { ...animal, locked: !animal.locked } : animal,
      ),
    }));
  }

  function togglePlacement(animalId: string) {
    const target = game.animals.find((animal) => animal.id === animalId);
    if (!target) return;
    if (target.activeSlot !== null) {
      storeAnimal(animalId);
      return;
    }
    const used = new Set(
      game.animals
        .map((animal) => animal.activeSlot)
        .filter((slot) => slot !== null),
    );
    const free = Array.from({ length: farmSlots }, (_, index) => index).find(
      (slot) => !used.has(slot),
    );
    if (free === undefined) {
      setMessage(
        "All habitats are occupied. Use the Farm screen to choose an animal to swap.",
      );
      openView("farm");
      return;
    }
    placeAnimalInSlot(animalId, free);
  }

  async function levelAnimal(animalId: string) {
    const animal = game.animals.find((candidate) => candidate.id === animalId);
    if (!animal) return;
    const cost = animalLevelCost(animal);
    if (game.coins < cost) {
      setMessage(`You need ${cost.toLocaleString()} coins for the next level.`);
      return;
    }
    try {
      const event = await runAuthoritativeAction({ type: "level-animal", animalId });
      if (event.type !== "animal-leveled") return;
      setMessage(`${animalName(event.animal)} reached level ${event.animal.level}.`);
      showAction("🌟", `${animalName(event.animal)} leveled up`, "spend");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Animal upgrade failed.");
    }
  }

  async function purchaseUpgrade(upgradeId: UpgradeId) {
    const definition = UPGRADES[upgradeId];
    const currentLevel = game.upgrades[upgradeId];
    if (currentLevel >= definition.maxLevel) {
      setMessage(`${definition.name} is already at maximum level.`);
      return;
    }
    const cost = upgradeCost(upgradeId, currentLevel);
    if (game.coins < cost) {
      setMessage(
        `You need ${cost.toLocaleString()} coins for ${definition.name}.`,
      );
      return;
    }
    try {
      const event = await runAuthoritativeAction({ type: "purchase-upgrade", upgradeId });
      if (event.type !== "upgrade-purchased") return;
      setMessage(`${definition.name} upgraded to level ${event.level}.`);
      setUpgradingId(upgradeId);
      window.setTimeout(() => setUpgradingId(null), 850);
      showAction("🛠️", `${definition.name} · Level ${event.level}`, "spend");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Farm upgrade failed.");
    }
  }

  function toggleMergeAnimal(animal: AnimalInstance) {
    if (selectedMergeIds.includes(animal.id)) {
      setSelectedMergeIds((current) =>
        current.filter((id) => id !== animal.id),
      );
      setMessage(`${animalName(animal)} removed from the merge tray.`);
      return;
    }
    if (selectedMergeIds.length >= 3) {
      setMessage(
        "The merge tray is full. Remove one animal before choosing another.",
      );
      return;
    }
    if (
      mergeTemplate &&
      (animal.speciesId !== mergeTemplate.speciesId ||
        animal.variant !== mergeTemplate.variant)
    ) {
      setMessage(
        `Choose another ${animalName(mergeTemplate)}. Merge parents must match.`,
      );
      return;
    }
    setSelectedMergeIds((current) => [...current, animal.id]);
    setMessage(
      `${animalName(animal)} added as parent ${selectedMergeIds.length + 1} of 3.`,
    );
  }

  function autoFillMerge() {
    let pool: AnimalInstance[] = [];
    if (mergeTemplate) {
      pool = mergeEligible.filter(
        (animal) =>
          animal.speciesId === mergeTemplate.speciesId &&
          animal.variant === mergeTemplate.variant,
      );
    } else {
      const groups = new Map<string, AnimalInstance[]>();
      mergeEligible.forEach((animal) => {
        const key = `${animal.speciesId}:${animal.variant}`;
        groups.set(key, [...(groups.get(key) ?? []), animal]);
      });
      const viable = [...groups.values()].filter((group) => group.length >= 3);
      viable.forEach((group) =>
        group.sort(
          (a, b) =>
            animalIncomePerMinute(a) - animalIncomePerMinute(b) ||
            a.potential - b.potential,
        ),
      );
      viable.sort(
        (a, b) =>
          a
            .slice(0, 3)
            .reduce((sum, animal) => sum + animalIncomePerMinute(animal), 0) -
          b
            .slice(0, 3)
            .reduce((sum, animal) => sum + animalIncomePerMinute(animal), 0),
      );
      pool = viable[0] ?? [];
    }
    pool.sort(
      (a, b) =>
        animalIncomePerMinute(a) - animalIncomePerMinute(b) ||
        a.potential - b.potential,
    );
    const preserved = selectedMergeAnimals.filter((animal) =>
      pool.some((candidate) => candidate.id === animal.id),
    );
    const chosen = [
      ...preserved,
      ...pool.filter(
        (animal) => !preserved.some((candidate) => candidate.id === animal.id),
      ),
    ].slice(0, 3);
    if (chosen.length < 3) {
      setMessage(
        mergeTemplate
          ? `You need ${3 - chosen.length} more stored ${animalName(mergeTemplate)} for autofill.`
          : "No stored bloodline has three unlocked matching creatures yet.",
      );
      return;
    }
    setSelectedMergeIds(chosen.map((animal) => animal.id));
    setMessage(
      `Autofill chose three ${animalName(chosen[0])} parents, protecting higher-value copies when possible.`,
    );
    showAction("🧬", "Merge tray autofilled", "magic");
  }

  async function performMerge() {
    if (mergeReveal) return;
    if (selectedMergeAnimals.length !== 3) {
      setMessage(
        `Choose ${3 - selectedMergeAnimals.length} more matching animal${selectedMergeAnimals.length === 2 ? "" : "s"} first.`,
      );
      return;
    }
    const parents = selectedMergeAnimals;
    try {
      const event = await runAuthoritativeAction({
        type: "merge",
        animalIds: parents.map((animal) => animal.id),
      });
      if (event.type !== "animals-merged") return;
      const merged = event.offspring;
      setSelectedMergeIds([]);
      setMergeReveal({ key: Date.now(), parents: event.parents, offspring: merged });
      setMessage("The three protected bloodlines are fusing…");
      window.setTimeout(() => {
        setMergeReveal(null);
        setSelectedId(merged.id);
        setResult({ kind: "animal", animal: merged });
        setMessage(`Merge complete: ${animalName(merged)} with Potential ${merged.potential}.`);
        showAction("🧬", `${animalName(merged)} created`, "magic");
      }, 2800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Merge failed.");
    }
  }

  function equipBorder(borderId: BorderId) {
    setGame((current) => ({ ...current, activeBorder: borderId }));
    setBorderPickerOpen(false);
    setMessage(`${BORDERS[borderId].name} is now active on your farm.`);
    showAction(BORDERS[borderId].icon, `${BORDERS[borderId].name} equipped`);
  }

  async function resetPrototype() {
    try {
      const event = await runAuthoritativeAction({ type: "reset-prototype" });
      if (event.type !== "prototype-reset") return;
      setView("farm");
      setSelectedId(null);
      setAnimalDetailOpen(false);
      setBorderPickerOpen(false);
      setSelectedMergeIds([]);
      setResult(null);
      setMergeReveal(null);
      setMessage("Protected prototype reset. Your starter animals are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prototype reset failed.");
    }
  }

  function openAnimalDetail(animalId: string) {
    setSelectedId(animalId);
    setAnimalDetailOpen(true);
  }

  function browseAnimal(direction: -1 | 1) {
    if (!selectedAnimal) return;
    const currentIndex = game.animals.findIndex(
      (animal) => animal.id === selectedAnimal.id,
    );
    const nextIndex =
      (currentIndex + direction + game.animals.length) % game.animals.length;
    setSelectedId(game.animals[nextIndex].id);
  }

  function openView(nextView: View) {
    setView(nextView);
    window.requestAnimationFrame(() =>
      document
        .getElementById("game-content")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const heroTitle =
    view === "farm"
      ? "Build a farm worthy of legends."
      : view === "summon"
        ? "Nine species. Five dazzling forms."
        : view === "animals"
          ? "Complete the creature archive."
          : view === "merge"
            ? "Choose the bloodline yourself."
            : view === "upgrades"
              ? "Grow from meadow to menagerie."
              : "Visit farms across the meadow.";
  const resultClass =
    result?.kind === "animal"
      ? result.animal.variant
      : result?.kind === "border"
        ? BORDERS[result.borderId].rarity.toLowerCase()
        : result?.kind === "batch"
          ? "batch"
          : "";

  return (
    <main className="game-shell">
      <header className="topbar">
        <button
          className="brand brand-button"
          type="button"
          onClick={() => openView("farm")}
          aria-label="Open GachaFarm"
        >
          <span className="brand-mark">GF</span>
          <span>
            <strong>GachaFarm</strong>
            <small>Raise the impossible</small>
          </span>
        </button>
        <div className="resources" aria-label="Farm resources">
          <span
            className="resource-pill coin-pill"
            title={`${game.coins.toLocaleString()} coins`}
          >
            <Coins aria-hidden="true" /> {compactNumber(game.coins)}
          </span>
          <span className="resource-pill" title="Discovery Stars">
            <Star aria-hidden="true" /> {game.discoveryStars}
          </span>
          <span className="resource-pill" title="Fusion Dust">
            <Gem aria-hidden="true" /> {game.fusionDust}
          </span>
          <button
            className="test-currency-button"
            type="button"
            onClick={addTestCurrency}
            disabled={serverActionPending || cloudStatus !== "synced"}
            title="Alpha testing shortcut: add 100,000 coins"
          >
            <Coins aria-hidden="true" />
            <span><small>TEST</small>+100,000</span>
          </button>
          <button
            className={`profile-button cloud-${cloudStatus}`}
            type="button"
            onClick={() => openView("visit")}
            title="Open online farm profile"
          >
            {cloudStatus === "local" || cloudStatus === "error" ? <CloudOff /> : <Cloud />}
            <span>
              <strong>{onlineProfile?.displayName ?? "Local Farm"}</strong>
              <small>{cloudStatus === "synced" ? "Cloud saved" : cloudStatus === "saving" ? "Saving…" : cloudStatus === "connecting" ? "Connecting…" : "Local save"}</small>
            </span>
          </button>
        </div>
      </header>

      <section className="hero-strip">
        <div>
          <p className="eyebrow">Protected Economy Beta · Collection Season 1</p>
          <h1>{heroTitle}</h1>
        </div>
        <button className="claim-button" type="button" onClick={claimIncome} disabled={serverActionPending || cloudStatus !== "synced"}>
          <span>
            {pendingIncome > 0 ? "Idle income ready" : "Animals are producing"}
          </span>
          <strong>
            {pendingIncome > 0
              ? `Claim ${pendingIncome.toLocaleString()} coins`
              : `${incomeRate} coins/min`}
          </strong>
        </button>
      </section>

      <div className="game-layout" id="game-content">
        <nav className="side-nav" aria-label="Game navigation">
          {navigation.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              type="button"
              onClick={() => openView(id)}
            >
              <span className="nav-sticker" aria-hidden="true">
                <Icon />
              </span>
              {label}
            </button>
          ))}
        </nav>

        {view === "farm" && (
          <section className="farm-card wide-card" aria-labelledby="farm-title">
            <div className="farm-heading">
              <div>
                <p className="eyebrow">
                  Active habitat ·{" "}
                  {
                    game.animals.filter((animal) => animal.activeSlot !== null)
                      .length
                  }
                  /{farmSlots}
                </p>
                <h2 id="farm-title">Sunnybrook Farm</h2>
                <small className="border-label">
                  <Fence aria-hidden="true" /> {activeBorder.name} ·{" "}
                  {activeBorder.description}
                </small>
              </div>
              <div className="farm-heading-actions">
                <div className="income-rate">
                  <span>
                    Farm income · Workshop Lv.{game.upgrades.production}
                  </span>
                  <strong>{incomeRate} coins/min</strong>
                </div>
                <button
                  className="border-switch-button"
                  type="button"
                  onClick={() => setBorderPickerOpen(true)}
                >
                  <Fence aria-hidden="true" />
                  <b>Change Border</b>
                  <small>{game.ownedBorders.length} owned</small>
                </button>
                <button
                  className="auto-place-button"
                  type="button"
                  onClick={autoPlaceFarm}
                >
                  <WandSparkles aria-hidden="true" />
                  <b>Auto Place</b>
                  <small>Best income</small>
                </button>
              </div>
            </div>
            {movingAnimalId && (
              <div className="move-mode">
                <span>
                  ↔ Click or drop on a habitat to place{" "}
                  {animalName(
                    game.animals.find(
                      (animal) => animal.id === movingAnimalId,
                    )!,
                  )}
                  .
                </span>
                <button type="button" onClick={() => setMovingAnimalId(null)}>
                  Cancel
                </button>
              </div>
            )}
            <div className={`farm-field border-${game.activeBorder}`}>
              <div className="farm-border-frame" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <button
                className="equipped-border-flag"
                type="button"
                onClick={() => setBorderPickerOpen(true)}
                aria-label={`Change equipped border. Currently ${activeBorder.name}`}
              >
                <Fence aria-hidden="true" />
                <div>
                  <small>Equipped border</small>
                  <strong>{activeBorder.name}</strong>
                </div>
                <span>Change</span>
              </button>
              <div className="animal-grid">
                {activeAnimals.map((animal, index) => (
                  <button
                    className={`animal-slot ${animal ? "occupied" : ""} ${movingAnimalId || draggingAnimalId ? "move-target" : ""} ${draggingAnimalId === animal?.id ? "dragging" : ""}`}
                    type="button"
                    key={index}
                    draggable={Boolean(animal)}
                    onDragStart={
                      animal
                        ? (event) => startAnimalDrag(event, animal.id)
                        : undefined
                    }
                    onDragEnd={() => setDraggingAnimalId(null)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => dropAnimalInSlot(event, index)}
                    onClick={() => handleFarmSlot(index, animal)}
                    aria-label={
                      animal
                        ? `${animalName(animal)}, habitat ${index + 1}. Drag to move or click for details.`
                        : `Empty habitat ${index + 1}. Drop or click to place an animal.`
                    }
                  >
                    {animal ? (
                      <>
                        <span className={`variant-tag ${animal.variant}`}>
                          {VARIANTS[animal.variant].name}
                        </span>
                        {animal.locked && (
                          <span className="lock-corner">◆</span>
                        )}
                        <span className="animal-stage">
                          <span className="animal-shadow" />
                          <CreatureArt
                            speciesId={animal.speciesId}
                            variant={animal.variant}
                            size="large"
                            animated
                          />
                          {now > 0 && (
                            <span
                              className="income-pop"
                              key={`${animal.id}-${Math.floor(now / 1000)}`}
                              aria-hidden="true"
                            >
                              ● +{perSecondIncome(animal, farmMultiplier)}
                            </span>
                          )}
                        </span>
                        <strong className="farm-animal-name">
                          {animalName(animal)}
                        </strong>
                        <small>
                          Habitat {index + 1} · {animalIncomePerMinute(animal)}
                          /min · P{animal.potential}
                        </small>
                      </>
                    ) : (
                      <>
                        <span className="empty-plus">+</span>
                        <strong>Empty habitat</strong>
                        <small>Drop or click to place</small>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <section
              className={`farm-storage ${draggingAnimalId ? "drop-ready" : ""}`}
              aria-label="Farm storage"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={dropAnimalInStorage}
            >
              <div className="farm-storage-heading">
                <div>
                  <span>Farm storage</span>
                  <strong>{storageByIncome.length} creatures waiting</strong>
                </div>
                <small>
                  Drag a creature onto a habitat · drop active creatures here to
                  store
                </small>
              </div>
              {storageByIncome.length ? (
                <div className="farm-storage-row">
                  {storageByIncome.map((animal) => (
                    <button
                      className={
                        draggingAnimalId === animal.id ? "dragging" : ""
                      }
                      type="button"
                      draggable
                      onDragStart={(event) => startAnimalDrag(event, animal.id)}
                      onDragEnd={() => setDraggingAnimalId(null)}
                      onClick={() => beginMove(animal.id)}
                      key={animal.id}
                    >
                      <CreatureArt
                        speciesId={animal.speciesId}
                        variant={animal.variant}
                        size="small"
                      />
                      <span>
                        <strong>{animalName(animal)}</strong>
                        <small>
                          +{animalIncomePerMinute(animal)}/min · tap to place
                        </small>
                      </span>
                      <b>⠿</b>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="farm-storage-empty">
                  Every owned creature is active. Drag one here to store it.
                </div>
              )}
            </section>
            <p className="status-message" role="status" aria-live="polite">
              {message}
            </p>
          </section>
        )}

        {view === "summon" && (
          <section
            className={`summon-screen wide-card ${isSummoning ? "summoning" : ""} ${summonReveal ? `revealing rarity-${summonReveal.rarity.toLowerCase()}` : ""}`}
            aria-labelledby="summon-title"
          >
            <div className={`summon-sky machine-${machine}`}>
              <span className="summon-star star-one">✦</span>
              <span className="summon-star star-two">✧</span>
              <span className="summon-star star-three">✦</span>
              <div className="magic-rings">
                <span />
                <span />
                <div className="great-bell">
                  {machine === "meadow" ? (
                    <Bell />
                  ) : machine === "starfall" ? (
                    <Sparkles />
                  ) : (
                    <Fence />
                  )}
                </div>
              </div>
            </div>
            <div className="summon-content">
              <p className="eyebrow">The Grand Gacha Hall</p>
              <h2 id="summon-title">Three machines. Three economies.</h2>
              <p>
                Coins grow your herd, Discovery Stars unlock premium creature
                pulls, and Fusion Dust forges farm borders.
              </p>
              <div className="banner-tabs machine-tabs">
                <button
                  className={
                    machine === "meadow"
                      ? "active meadow-machine"
                      : "meadow-machine"
                  }
                  type="button"
                  onClick={() => setMachine("meadow")}
                >
                  <span>
                    <Bell />
                  </span>
                  <b>Meadow Bell</b>
                  <small>
                    <Coins /> Coins · everyday creatures
                  </small>
                </button>
                <button
                  className={
                    machine === "starfall"
                      ? "active starfall-machine"
                      : "starfall-machine"
                  }
                  type="button"
                  onClick={() => setMachine("starfall")}
                >
                  <span>
                    <Sparkles />
                  </span>
                  <b>Starfall Gate</b>
                  <small>
                    <Star /> Stars · Rare+ guaranteed
                  </small>
                </button>
                <button
                  className={
                    machine === "border"
                      ? "active border-machine"
                      : "border-machine"
                  }
                  type="button"
                  onClick={() => setMachine("border")}
                >
                  <span>
                    <Fence />
                  </span>
                  <b>Border Forge</b>
                  <small>
                    <Gem /> Dust · farm styles
                  </small>
                </button>
              </div>
              <div className="banner-details">
                {machine === "meadow" ? (
                  <>
                    <div>
                      <span>Species ranks</span>
                      <strong>5% Mythic · 7% Legendary</strong>
                      <small>Grand summon guarantees Rare+ in slot 10</small>
                    </div>
                    <div>
                      <span>Five variants</span>
                      <strong>Mystic 2% · Diamond 5%</strong>
                      <small>Golden 10% · Bronze 18% · Natural 65%</small>
                    </div>
                    <div>
                      <span>Mythic guarantee</span>
                      <strong>{game.pity + 1}/20 pulls</strong>
                      <small>Uses the main farm coin economy</small>
                    </div>
                  </>
                ) : machine === "starfall" ? (
                  <>
                    <div>
                      <span>Premium pool</span>
                      <strong>Every creature is Rare+</strong>
                      <small>Common species are removed from this gate</small>
                    </div>
                    <div>
                      <span>Variant boost</span>
                      <strong>+12% premium chance</strong>
                      <small>More Golden, Diamond, and Mystic forms</small>
                    </div>
                    <div>
                      <span>Mythic boost</span>
                      <strong>+3% Dragon weight</strong>
                      <small>Costs Stars earned from new discoveries</small>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span>Featured reward</span>
                      <strong>Starfall Fence · 5%</strong>
                      <small>Boosts Mythic rate by +2%</small>
                    </div>
                    <div>
                      <span>Duplicate refund</span>
                      <strong>15 Fusion Dust</strong>
                      <small>
                        A duplicate refunds most of its 20 Dust cost
                      </small>
                    </div>
                    <div>
                      <span>Legendary guarantee</span>
                      <strong>{game.borderPity + 1}/15 pulls</strong>
                      <small>Guaranteed Starfall on pull 15</small>
                    </div>
                  </>
                )}
              </div>
              <div className="summon-actions">
                <button
                  className={`summon-main-button action-control machine-action-${machine} ${isSummoning ? "activated" : ""}`}
                  type="button"
                  disabled={isSummoning || serverActionPending || cloudStatus !== "synced"}
                  onClick={() => performSummon(1)}
                >
                  <span>
                    {isSummoning
                      ? "The magic is gathering…"
                      : machine === "meadow"
                        ? "Ring Meadow Bell ×1"
                        : machine === "starfall"
                          ? "Open Starfall Gate"
                          : "Forge a Farm Border"}
                  </span>
                  <strong>
                    {machine === "meadow" ? (
                      <Coins />
                    ) : machine === "starfall" ? (
                      <Star />
                    ) : (
                      <Gem />
                    )}{" "}
                    {(machine === "meadow"
                      ? SUMMON_COST
                      : machine === "starfall"
                        ? STAR_GACHA_COST
                        : BORDER_SUMMON_COST
                    ).toLocaleString()}
                  </strong>
                </button>
                {machine === "meadow" && (
                  <button
                    className={`ten-pull-button action-control ${isSummoning ? "activated" : ""}`}
                    type="button"
                    disabled={isSummoning || serverActionPending || cloudStatus !== "synced"}
                    onClick={() => performSummon(10)}
                  >
                    <span>Grand Summon ×10</span>
                    <strong>
                      <Coins /> {TEN_PULL_COST.toLocaleString()}
                    </strong>
                    <small>
                      Save 2,500 · Rare+ guaranteed · reveal all ten
                    </small>
                  </button>
                )}
              </div>
              <p className="rate-note">
                Rates are shown before purchase. Each machine uses only the
                resource displayed on its button.
              </p>
              <div className="border-collection">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Owned styles</p>
                    <h3>Your farm borders</h3>
                  </div>
                  <span className="count-badge">
                    {game.ownedBorders.length}/{Object.keys(BORDERS).length}
                  </span>
                </div>
                <div className="border-grid">
                  {game.ownedBorders.map((id) => (
                    <article
                      className={game.activeBorder === id ? "active" : ""}
                      key={id}
                    >
                      <div className={`border-swatch border-${id}`}>
                        <Fence />
                      </div>
                      <div>
                        <strong>{BORDERS[id].name}</strong>
                        <small>{BORDERS[id].description}</small>
                      </div>
                      <button
                        type="button"
                        disabled={game.activeBorder === id}
                        onClick={() => equipBorder(id)}
                      >
                        {game.activeBorder === id ? "Equipped" : "Equip"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </div>
            <p className="status-message" role="status">
              {message}
            </p>
          </section>
        )}

        {view === "animals" && (
          <section
            className="farm-card manage-card wide-card"
            aria-labelledby="collection-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Owned collection</p>
                <h2 id="collection-title">Your animals</h2>
              </div>
              <div className="heading-actions">
                <span className="count-badge">{game.animals.length} owned</span>
                <button
                  className="archive-button"
                  type="button"
                  onClick={() => setArchiveOpen(true)}
                >
                  <Archive aria-hidden="true" /> Open Creature Archive
                </button>
              </div>
            </div>
            <div className="collection-guide">
              <span>Highest-income creatures appear first by default.</span>
              <strong>
                {visibleAnimals.length} creature
                {visibleAnimals.length === 1 ? "" : "s"} shown
              </strong>
            </div>
            <div
              className="collection-filters"
              aria-label="Animal collection filters"
            >
              <label className="collection-search">
                <span>Search</span>
                <input
                  value={collectionSearch}
                  onChange={(event) => setCollectionSearch(event.target.value)}
                  placeholder="Cow, Mystic, Dragon…"
                />
              </label>
              <label>
                <span>Sort</span>
                <select
                  value={collectionSort}
                  onChange={(event) =>
                    setCollectionSort(event.target.value as CollectionSort)
                  }
                >
                  <option value="income">Income · highest</option>
                  <option value="potential">Potential · highest</option>
                  <option value="newest">Newest first</option>
                  <option value="name">Name · A–Z</option>
                </select>
              </label>
              <label>
                <span>Rank</span>
                <select
                  value={rankFilter}
                  onChange={(event) =>
                    setRankFilter(event.target.value as "all" | Rank)
                  }
                >
                  <option value="all">All ranks</option>
                  {RANK_ORDER.map((rank) => (
                    <option value={rank} key={rank}>
                      {rank}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Variant</span>
                <select
                  value={variantFilter}
                  onChange={(event) =>
                    setVariantFilter(event.target.value as "all" | VariantId)
                  }
                >
                  <option value="all">All variants</option>
                  {(Object.keys(VARIANTS) as VariantId[]).map((variant) => (
                    <option value={variant} key={variant}>
                      {VARIANTS[variant].name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as CollectionStatus)
                  }
                >
                  <option value="all">Any status</option>
                  <option value="active">Active farm</option>
                  <option value="stored">In storage</option>
                  <option value="locked">Locked</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setCollectionSearch("");
                  setCollectionSort("income");
                  setRankFilter("all");
                  setVariantFilter("all");
                  setStatusFilter("all");
                }}
              >
                Reset
              </button>
            </div>
            {visibleAnimals.length ? (
              <div className="collection-grid">
                {visibleAnimals.map((animal) => (
                  <AnimalCard
                    key={animal.id}
                    animal={animal}
                    selected={selectedId === animal.id}
                    valueRank={
                      incomeValueRank.get(animal.id) ?? game.animals.length
                    }
                    onSelect={() => openAnimalDetail(animal.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="collection-empty">
                <span>⌕</span>
                <h3>No creatures match</h3>
                <p>Try removing a filter or searching for another name.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCollectionSearch("");
                    setRankFilter("all");
                    setVariantFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
            <p className="status-message" role="status">
              {message}
            </p>
          </section>
        )}

        {view === "merge" && (
          <section className="farm-card manage-card wide-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Manual species merge</p>
                <h2>Choose your three parents</h2>
              </div>
              <span className="count-badge">◇ {game.fusionDust}</span>
            </div>
            <div className="merge-explainer">
              <span>1. Pick an animal</span>
              <b>→</b>
              <span>2. Pick two matching copies</span>
              <b>→</b>
              <span>3. Confirm merge</span>
            </div>
            <div className="merge-workbench">
              <section
                className="merge-tray"
                aria-label="Selected merge parents"
              >
                <div className="merge-tray-heading">
                  <div>
                    <span>Merge tray</span>
                    <strong>{selectedMergeAnimals.length}/3 selected</strong>
                  </div>
                  <div className="merge-tray-actions">
                    <button
                      className="autofill-merge-button action-control"
                      type="button"
                      onClick={autoFillMerge}
                    >
                      <Dna aria-hidden="true" /> Auto Fill
                    </button>
                    {selectedMergeAnimals.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedMergeIds([])}
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                <div className="merge-slots">
                  {Array.from({ length: 3 }, (_, index) => {
                    const animal = selectedMergeAnimals[index];
                    return (
                      <div className={animal ? "filled" : ""} key={index}>
                        <span className="merge-slot-number">{index + 1}</span>
                        {animal ? (
                          <>
                            <CreatureArt
                              speciesId={animal.speciesId}
                              variant={animal.variant}
                              size="small"
                            />
                            <strong>{animalName(animal)}</strong>
                            <small>
                              P{animal.potential} · +
                              {animalIncomePerMinute(animal)}/min
                            </small>
                            <button
                              type="button"
                              onClick={() => toggleMergeAnimal(animal)}
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="merge-slot-plus">+</span>
                            <strong>Choose parent {index + 1}</strong>
                            <small>
                              {mergeTemplate
                                ? `Needs ${animalName(mergeTemplate)}`
                                : "Any stored animal"}
                            </small>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <span className="merge-arrow">→</span>
                  <div className="merge-result-preview">
                    <span>?</span>
                    <strong>
                      {mergeTemplate
                        ? animalName(mergeTemplate)
                        : "New offspring"}
                    </strong>
                    <small>Best parent stats · possible next variant</small>
                  </div>
                </div>
                <button
                  className="confirm-merge-button action-control"
                  type="button"
                  disabled={selectedMergeAnimals.length !== 3 || Boolean(mergeReveal) || serverActionPending || cloudStatus !== "synced"}
                  onClick={performMerge}
                >
                  {mergeReveal
                    ? "Bloodlines fusing…"
                    : selectedMergeAnimals.length === 3
                    ? "Merge these 3 animals"
                    : `Choose ${3 - selectedMergeAnimals.length} more`}
                </button>
              </section>
              <section className="merge-picker">
                <div className="merge-picker-heading">
                  <div>
                    <span>Eligible storage</span>
                    <strong>{mergeEligible.length} unlocked animals</strong>
                  </div>
                  {mergeTemplate && (
                    <small>
                      {compatibleMergeCount} matching{" "}
                      {animalName(mergeTemplate)} owned
                    </small>
                  )}
                </div>
                {mergeEligible.length ? (
                  <div className="merge-select-grid">
                    {mergeEligible.map((animal) => {
                      const selectedIndex = selectedMergeIds.indexOf(animal.id);
                      const compatible =
                        !mergeTemplate ||
                        (animal.speciesId === mergeTemplate.speciesId &&
                          animal.variant === mergeTemplate.variant);
                      return (
                        <button
                          type="button"
                          className={`${selectedIndex >= 0 ? "selected" : ""} ${!compatible ? "incompatible" : ""}`}
                          key={animal.id}
                          onClick={() => toggleMergeAnimal(animal)}
                          aria-pressed={selectedIndex >= 0}
                        >
                          <span className="merge-check">
                            {selectedIndex >= 0 ? selectedIndex + 1 : "+"}
                          </span>
                          <CreatureArt
                            speciesId={animal.speciesId}
                            variant={animal.variant}
                            size="small"
                          />
                          <strong>{animalName(animal)}</strong>
                          <small>
                            Level {animal.level} · Potential {animal.potential}
                          </small>
                          <span className="merge-pick-stats">
                            Yield {animal.yieldStat} · Tempo {animal.tempoStat}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span><Dna aria-hidden="true" /></span>
                    <h3>No eligible animals</h3>
                    <p>
                      Move animals to storage and unlock them before merging.
                    </p>
                    <button type="button" onClick={() => openView("animals")}>
                      Open Animals
                    </button>
                  </div>
                )}
              </section>
            </div>
            <p className="status-message">{message}</p>
          </section>
        )}

        {view === "upgrades" && (
          <section className="farm-card manage-card wide-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Farm workshop · rebalanced</p>
                <h2>Permanent upgrades</h2>
              </div>
              <span className="count-badge">
                ● {game.coins.toLocaleString()}
              </span>
            </div>
            <div className="economy-note">
              <span>Longer progression</span>
              <strong>
                Workshop prices now scale more sharply after every level.
              </strong>
              <p>
                Choose between summoning now or saving for a meaningful
                permanent boost.
              </p>
            </div>
            <div className="upgrade-summary">
              <div>
                <span>Habitats</span>
                <strong>{farmSlots}</strong>
              </div>
              <div>
                <span>Production bonus</span>
                <strong>+{(game.upgrades.production - 1) * 10}%</strong>
              </div>
              <div>
                <span>Offline capacity</span>
                <strong>{4 + (game.upgrades.offline - 1) * 2}h</strong>
              </div>
              <div>
                <span>Premium luck</span>
                <strong>+{game.upgrades.luck - 1}%</strong>
              </div>
            </div>
            <div className="upgrade-grid">
              {Object.values(UPGRADES).map((upgrade) => {
                const level = game.upgrades[upgrade.id];
                const maxed = level >= upgrade.maxLevel;
                const cost = upgradeCost(upgrade.id, level);
                const UpgradeIcon = upgradeIcons[upgrade.id];
                return (
                  <article
                    className={
                      upgradingId === upgrade.id ? "upgrade-success" : ""
                    }
                    key={upgrade.id}
                  >
                    <span className={`upgrade-icon upgrade-icon-${upgrade.id}`}>
                      <UpgradeIcon aria-hidden="true" />
                    </span>
                    <div className="upgrade-copy">
                      <small>
                        Level {level}/{upgrade.maxLevel}
                      </small>
                      <h3>{upgrade.name}</h3>
                      <p>{upgrade.description}</p>
                      <div className="level-pips">
                        {Array.from(
                          { length: upgrade.maxLevel },
                          (_, index) => (
                            <span
                              className={index < level ? "filled" : ""}
                              key={index}
                            />
                          ),
                        )}
                      </div>
                    </div>
                    <button
                      className="action-control"
                      type="button"
                      disabled={maxed || serverActionPending || cloudStatus !== "synced"}
                      onClick={() => purchaseUpgrade(upgrade.id)}
                    >
                      {maxed ? (
                        "Max level"
                      ) : (
                        <>
                          Upgrade <b>● {cost.toLocaleString()}</b>
                        </>
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
            <section className="alpha-goals">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Season goals</p>
                  <h3>Meadow League milestones</h3>
                </div>
                <span className="count-badge">Alpha</span>
              </div>
              <div className="goal-grid">
                <article>
                  <span>Own 10 creatures</span>
                  <strong>{Math.min(game.animals.length, 10)}/10</strong>
                  <progress
                    max="10"
                    value={Math.min(game.animals.length, 10)}
                  />
                </article>
                <article>
                  <span>Discover 5 species</span>
                  <strong>
                    {Math.min(game.discoveredSpecies.length, 5)}/5
                  </strong>
                  <progress
                    max="5"
                    value={Math.min(game.discoveredSpecies.length, 5)}
                  />
                </article>
                <article>
                  <span>Reach 200 coins/min</span>
                  <strong>{Math.min(incomeRate, 200)}/200</strong>
                  <progress max="200" value={Math.min(incomeRate, 200)} />
                </article>
              </div>
            </section>
            <section className="future-upgrades">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Next workshop tiers</p>
                  <h3>Planned progression</h3>
                </div>
                <span className="count-badge muted-badge">Coming later</span>
              </div>
              <div className="future-upgrade-grid">
                <article>
                  <span><Dna aria-hidden="true" /></span>
                  <div>
                    <strong>Species Mastery</strong>
                    <small>
                      Invest in your favorite bloodline for species-specific
                      income perks.
                    </small>
                  </div>
                  <b>Tier II</b>
                </article>
                <article>
                  <span><Palette aria-hidden="true" /></span>
                  <div>
                    <strong>Border Refinery</strong>
                    <small>
                      Fuse duplicate borders to strengthen their passive
                      bonuses.
                    </small>
                  </div>
                  <b>Tier II</b>
                </article>
                <article>
                  <span><Bot aria-hidden="true" /></span>
                  <div>
                    <strong>Farm Caretaker</strong>
                    <small>
                      Save farm loadouts and automate selected management tasks.
                    </small>
                  </div>
                  <b>Tier III</b>
                </article>
                <article>
                  <span><Sparkles aria-hidden="true" /></span>
                  <div>
                    <strong>Sanctuary Ascension</strong>
                    <small>
                      Late-game prestige resets for permanent account-wide
                      power.
                    </small>
                  </div>
                  <b>Endgame</b>
                </article>
              </div>
            </section>
            <p className="status-message">{message}</p>
          </section>
        )}

        {view === "visit" && (
          <section className="farm-card manage-card wide-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Online Farm Beta</p>
                <h2>Cloud profile and farm visits</h2>
              </div>
              <span className={`count-badge cloud-status-badge cloud-${cloudStatus}`}>
                {cloudStatus === "local" || cloudStatus === "error" ? <CloudOff /> : <Cloud />}
                {cloudStatus === "synced" ? "Cloud saved" : cloudStatus === "saving" ? "Saving…" : cloudStatus === "connecting" ? "Connecting…" : "Local mode"}
              </span>
            </div>
            {onlineProfile ? (
              <>
                <div className="online-profile-card">
                  <div className="online-profile-identity">
                    <span><Cloud /></span>
                    <div>
                      <small>Your online farm</small>
                      <strong>{onlineProfile.displayName}</strong>
                      <p>{cloudLastSaved ? `Last cloud save ${new Date(cloudLastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Preparing first cloud save…"}</p>
                    </div>
                  </div>
                  <label className="online-name-field">
                    <span>Farm name</span>
                    <input
                      value={profileName}
                      maxLength={24}
                      onChange={(event) => setProfileName(event.target.value)}
                    />
                  </label>
                  <button className="online-secondary-button" type="button" onClick={updateOnlineProfile} disabled={profileName.trim() === onlineProfile.displayName}>
                    Update name
                  </button>
                  <button className="visit-code-button" type="button" onClick={copyVisitCode}>
                    <span><small>Visit code</small><strong>{onlineProfile.visitCode}</strong></span>
                    <Copy />
                  </button>
                  <button className="cloud-save-now" type="button" onClick={saveCloudNow} disabled={cloudStatus === "saving"}>
                    <Cloud /> {cloudStatus === "saving" ? "Saving…" : "Save now"}
                  </button>
                </div>

                <section className="online-visit-section">
                  <div className="online-search-heading">
                    <div>
                      <p className="eyebrow">Find a farmer</p>
                      <h3>Visit a read-only farm</h3>
                    </div>
                    <small>Search by farm name or exact visit code</small>
                  </div>
                  <div className="online-farm-search">
                    <Search aria-hidden="true" />
                    <input
                      value={visitQuery}
                      onChange={(event) => setVisitQuery(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void searchOnlineFarms(); }}
                      placeholder="Example: SUNNY123 or Sunnybrook"
                    />
                    <button type="button" onClick={searchOnlineFarms} disabled={visitLoading}>
                      {visitLoading ? "Searching…" : "Search farms"}
                    </button>
                  </div>

                  <div className="online-farm-browser">
                    <div className="online-farm-results">
                      <div className="online-results-label">
                        <span>Search results</span>
                        <strong>{visitResults.length}</strong>
                      </div>
                      {visitResults.length ? visitResults.map((farm) => (
                        <button
                          className={visitedFarm?.visitCode === farm.visitCode ? "active" : ""}
                          type="button"
                          onClick={() => setVisitedFarm(farm)}
                          key={farm.visitCode}
                        >
                          <span><House /></span>
                          <div>
                            <strong>{farm.displayName}</strong>
                            <small>{farm.visitCode} · {farm.incomeRate.toLocaleString()} coins/min</small>
                          </div>
                          <b>{farm.animalCount} creatures</b>
                        </button>
                      )) : (
                        <div className="online-results-empty">
                          <Search />
                          <strong>Find your first farm</strong>
                          <small>Ask another player for their visit code.</small>
                        </div>
                      )}
                    </div>

                    {visitedFarm ? (
                      <article className={`visited-farm-card border-${visitedFarm.activeBorder}`}>
                        <header>
                          <div>
                            <small>Visiting · {visitedFarm.visitCode}</small>
                            <h3>{visitedFarm.displayName}</h3>
                            <p><Fence /> {BORDERS[visitedFarm.activeBorder].name}</p>
                          </div>
                          <span>Read only</span>
                        </header>
                        <div className="visited-farm-stats">
                          <div><span>Income</span><strong>{compactNumber(visitedFarm.incomeRate)}/min</strong></div>
                          <div><span>Creatures</span><strong>{visitedFarm.animalCount}</strong></div>
                          <div><span>Species</span><strong>{visitedFarm.speciesCount}</strong></div>
                        </div>
                        <div className="visited-habitats">
                          {visitedFarm.activeAnimals.length ? visitedFarm.activeAnimals.map((animal, index) => (
                            <div className={`visited-animal variant-${animal.variant}`} key={`${animal.speciesId}-${animal.activeSlot}-${index}`}>
                              <CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="small" />
                              <strong>{SPECIES[animal.speciesId].name}</strong>
                              <small>{VARIANTS[animal.variant].name} · Lv.{animal.level}</small>
                            </div>
                          )) : <div className="visited-empty">This farmer has no active creatures yet.</div>}
                        </div>
                        <footer>Updated {new Date(visitedFarm.updatedAt).toLocaleString()}</footer>
                      </article>
                    ) : (
                      <div className="online-visit-placeholder">
                        <Globe2 />
                        <h3>Select a farm to visit</h3>
                        <p>Its active creatures, equipped border, and collection progress will appear here.</p>
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="online-connecting-card">
                {cloudStatus === "connecting" ? <Cloud /> : <CloudOff />}
                <div>
                  <h3>{cloudStatus === "connecting" ? "Connecting your farm…" : "Cloud profile unavailable"}</h3>
                  <p>{cloudStatus === "connecting" ? "Your existing browser save will be copied safely when the connection is ready." : "You can keep playing locally. Cloud sync will retry when the game opens again."}</p>
                </div>
              </div>
            )}
            <p className="status-message">{message}</p>
          </section>
        )}
      </div>

      {summonReveal && (
        <div
          className={`summon-cinematic rarity-${summonReveal.rarity.toLowerCase()} ${summonReveal.animals && summonReveal.animals.length > 1 ? "batch-cinematic" : "single-cinematic"}`}
          key={summonReveal.key}
          role="status"
          aria-live="assertive"
        >
          <div className="cinematic-vignette" />
          {summonReveal.animals && summonReveal.animals.length > 1 ? (
            <div className="grand-star-rain" aria-hidden="true">
              {summonReveal.animals.map((animal, index) => (
                <span
                  className={`pull-star pull-${animalRevealRank(animal).toLowerCase()}`}
                  style={{
                    left: `${grandSummonStarPositions[index]}%`,
                    animationDelay: `${index * 85}ms`,
                  }}
                  key={animal.id}
                >
                  <Star fill="currentColor" />
                </span>
              ))}
            </div>
          ) : (
            <>
              <div className="fallen-star">
                <Star fill="currentColor" />
              </div>
              <div className="star-impact">
                <span />
                {Array.from({ length: 8 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
            </>
          )}
          <section className="cinematic-rewards">
            <p>
              {summonReveal.animals && summonReveal.animals.length > 1
                ? "Ten stars answered"
                : "Constellation answered"}
            </p>
            <h2>{summonReveal.label}</h2>
            {summonReveal.animals && (
              <div
                className={`cinematic-creature-grid ${summonReveal.animals.length === 1 ? "single" : "batch"}`}
              >
                {summonReveal.animals.map((animal, index) => (
                  <article
                    className={`reveal-${animalRevealRank(animal).toLowerCase()} variant-${animal.variant}`}
                    style={{ animationDelay: `${1100 + index * 105}ms` }}
                    key={animal.id}
                  >
                    <CreatureArt
                      speciesId={animal.speciesId}
                      variant={animal.variant}
                      size={
                        summonReveal.animals?.length === 1 ? "large" : "small"
                      }
                    />
                    <strong>{SPECIES[animal.speciesId].name}</strong>
                    <small>
                      {VARIANTS[animal.variant].name} ·{" "}
                      {animalRevealRank(animal)}
                    </small>
                  </article>
                ))}
              </div>
            )}
            {summonReveal.borderId && (
              <div className="cinematic-border-card">
                <Fence />
                <strong>{BORDERS[summonReveal.borderId].name}</strong>
                <small>{BORDERS[summonReveal.borderId].rarity} border</small>
              </div>
            )}
          </section>
        </div>
      )}

      {mergeReveal && (
        <div
          className={`merge-cinematic reveal-${animalRevealRank(mergeReveal.offspring).toLowerCase()}`}
          key={mergeReveal.key}
          role="status"
          aria-live="assertive"
        >
          <div className="merge-magic-field" />
          <section className="merge-animation-stage">
            <p>Species merge</p>
            <h2>Three bloodlines become one</h2>
            <div className="merge-parent-orbit" aria-hidden="true">
              {mergeReveal.parents.map((parent, index) => (
                <div className={`merge-parent merge-parent-${index + 1}`} key={parent.id}>
                  <CreatureArt speciesId={parent.speciesId} variant={parent.variant} size="small" />
                </div>
              ))}
              <span className="merge-core"><Dna /></span>
            </div>
            <div className="merge-offspring-reveal">
              <CreatureArt
                speciesId={mergeReveal.offspring.speciesId}
                variant={mergeReveal.offspring.variant}
                size="large"
              />
              <strong>{animalName(mergeReveal.offspring)}</strong>
              <small>
                Potential {mergeReveal.offspring.potential} · +5 Fusion Dust
              </small>
            </div>
          </section>
        </div>
      )}

      {borderPickerOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setBorderPickerOpen(false)}
        >
          <section
            className="picker-modal farm-border-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="farm-border-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setBorderPickerOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">Farm appearance</p>
            <h2 id="farm-border-picker-title">Change your farm border</h2>
            <p className="modal-intro">
              Choose any border you own. Its passive bonus activates immediately.
            </p>
            <div className="farm-border-options">
              {game.ownedBorders.map((borderId) => {
                const border = BORDERS[borderId];
                const active = game.activeBorder === borderId;
                return (
                  <button
                    className={`farm-border-option border-${borderId} ${active ? "active" : ""}`}
                    type="button"
                    disabled={active}
                    onClick={() => equipBorder(borderId)}
                    key={borderId}
                  >
                    <span><Fence /></span>
                    <div>
                      <small>{border.rarity}</small>
                      <strong>{border.name}</strong>
                      <p>{border.description}</p>
                    </div>
                    <b>{active ? "Equipped" : "Equip"}</b>
                  </button>
                );
              })}
            </div>
            <button
              className="border-forge-link"
              type="button"
              onClick={() => {
                setBorderPickerOpen(false);
                setMachine("border");
                openView("summon");
              }}
            >
              <Sparkles /> Get more borders in the Border Forge
            </button>
          </section>
        </div>
      )}

      {archiveOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setArchiveOpen(false)}
        >
          <section
            className="picker-modal archive-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setArchiveOpen(false)}
            >
              ×
            </button>
            <div className="archive-header">
              <div>
                <p className="eyebrow">Season 1 collection</p>
                <h2 id="archive-title">Creature Archive</h2>
                <p>
                  Discover every species and collect all five material variants.
                </p>
              </div>
              <div className="archive-progress">
                <strong>
                  {game.discoveredSpecies.length}/{Object.keys(SPECIES).length}
                </strong>
                <span>species discovered</span>
                <progress
                  max={Object.keys(SPECIES).length}
                  value={game.discoveredSpecies.length}
                />
              </div>
            </div>
            <div className="archive-ranks">
              {RANK_ORDER.map((rank) => {
                const rankSpecies = Object.values(SPECIES).filter(
                  (species) => species.rank === rank,
                );
                return (
                  <section key={rank}>
                    <div className="archive-rank-heading">
                      <span className={`rank-badge ${rank.toLowerCase()}`}>
                        {rank}
                      </span>
                      <small>
                        {
                          rankSpecies.filter((species) =>
                            game.discoveredSpecies.includes(species.id),
                          ).length
                        }
                        /{rankSpecies.length} found
                      </small>
                    </div>
                    <div className="archive-species-grid">
                      {rankSpecies.map((species) => {
                        const discovered = game.discoveredSpecies.includes(
                          species.id,
                        );
                        const owned = game.animals.filter(
                          (animal) => animal.speciesId === species.id,
                        );
                        const ownedVariants = new Set(
                          owned.map((animal) => animal.variant),
                        );
                        return (
                          <article
                            className={`${discovered ? "discovered" : "unknown"} rank-${rank.toLowerCase()}`}
                            key={species.id}
                          >
                            {discovered ? (
                              <CreatureArt
                                speciesId={species.id}
                                size="medium"
                              />
                            ) : (
                              <span className="archive-silhouette">?</span>
                            )}
                            <div className="archive-species-copy">
                              <h3>
                                {discovered ? species.name : "Unknown creature"}
                              </h3>
                              <p>
                                {discovered
                                  ? `${owned.length} owned · ${ownedVariants.size}/5 variants`
                                  : `${species.summonWeight}% base summon rate`}
                              </p>
                              <div className="variant-discovery">
                                {(
                                  Object.keys(
                                    VARIANTS,
                                  ) as AnimalInstance["variant"][]
                                ).map((variant) => (
                                  <span
                                    className={`${ownedVariants.has(variant) ? "owned" : ""} ${variant}`}
                                    title={`${VARIANTS[variant].name}${ownedVariants.has(variant) ? " owned" : " missing"}`}
                                    key={variant}
                                  />
                                ))}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="archive-footer">
              <span>✦ New species award one Discovery Star.</span>
              <button type="button" onClick={() => setArchiveOpen(false)}>
                Back to Animals
              </button>
            </div>
          </section>
        </div>
      )}

      {slotPicker !== null && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSlotPicker(null)}
        >
          <section
            className="picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setSlotPicker(null)}
            >
              ×
            </button>
            <p className="eyebrow">Habitat {slotPicker + 1}</p>
            <h2 id="picker-title">Choose an animal to place</h2>
            <p className="modal-intro">
              Pick directly from storage. You can move it again by clicking its
              farm habitat.
            </p>
            {storageAnimals.length ? (
              <div className="picker-list">
                {storageAnimals.map((animal) => (
                  <button
                    type="button"
                    key={animal.id}
                    onClick={() => placeAnimalInSlot(animal.id, slotPicker)}
                  >
                    <CreatureArt
                      speciesId={animal.speciesId}
                      variant={animal.variant}
                      size="small"
                    />
                    <div>
                      <strong>{animalName(animal)}</strong>
                      <small>
                        Level {animal.level} · P{animal.potential}
                      </small>
                    </div>
                    <b>+{animalIncomePerMinute(animal)}/min</b>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span><Package aria-hidden="true" /></span>
                <h3>Storage is empty</h3>
                <p>Summon another creature or move an active animal.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {farmAnimal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setFarmAnimalId(null)}
        >
          <section
            className="picker-modal animal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="farm-animal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setFarmAnimalId(null)}
            >
              ×
            </button>
            <div className="detail-identity">
              <CreatureArt
                speciesId={farmAnimal.speciesId}
                variant={farmAnimal.variant}
                size="large"
              />
              <div>
                <small>Habitat {(farmAnimal.activeSlot ?? 0) + 1}</small>
                <h2 id="farm-animal-title">{animalName(farmAnimal)}</h2>
                <p>
                  {SPECIES[farmAnimal.speciesId].rank} · Level{" "}
                  {farmAnimal.level} · Potential {farmAnimal.potential}
                </p>
              </div>
            </div>
            <div className="production-strip">
              <span>Production</span>
              <strong>+{animalIncomePerMinute(farmAnimal)} coins/min</strong>
            </div>
            <h4>Genetic stats</h4>
            <StatGrid animal={farmAnimal} />
            <div className="modal-action-row">
              <button type="button" onClick={() => storeAnimal(farmAnimal.id)}>
                Move to storage
              </button>
              <button
                className="primary-small"
                type="button"
                onClick={() => beginMove(farmAnimal.id)}
              >
                Move or swap
              </button>
              <button
                type="button"
                onClick={() => {
                  setFarmAnimalId(null);
                  openAnimalDetail(farmAnimal.id);
                }}
              >
                Full details
              </button>
            </div>
          </section>
        </div>
      )}

      {animalDetailOpen && selectedAnimal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setAnimalDetailOpen(false)}
        >
          <section
            className="picker-modal animal-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="animal-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setAnimalDetailOpen(false)}
            >
              ×
            </button>
            <div className="animal-detail-top">
              <div className="detail-identity">
                <CreatureArt
                  speciesId={selectedAnimal.speciesId}
                  variant={selectedAnimal.variant}
                  size="large"
                />
                <div>
                  <small>
                    {SPECIES[selectedAnimal.speciesId].rank} ·{" "}
                    {VARIANTS[selectedAnimal.variant].name}
                  </small>
                  <h2 id="animal-detail-title">{animalName(selectedAnimal)}</h2>
                  <p>
                    Level {selectedAnimal.level} · Potential{" "}
                    {selectedAnimal.potential}
                  </p>
                </div>
              </div>
              <span
                className={`detail-status ${selectedAnimal.activeSlot === null ? "stored" : "active"}`}
              >
                {selectedAnimal.activeSlot === null
                  ? "In storage"
                  : `Habitat ${selectedAnimal.activeSlot + 1}`}
              </span>
            </div>
            <div className="animal-detail-sections">
              <section>
                <h3>Production</h3>
                <strong className="big-production">
                  +{animalIncomePerMinute(selectedAnimal)} coins/min
                </strong>
                <p>
                  Yield and Tempo directly affect this animal&apos;s idle
                  income.
                </p>
              </section>
              <section>
                <h3>Genetic stats</h3>
                <StatGrid
                  animal={selectedAnimal}
                  comparison={comparisonAnimal}
                />
                <p>
                  Green numbers compare against your strongest matching species.
                </p>
              </section>
              <section>
                <h3>Management</h3>
                <p>
                  {selectedAnimal.locked
                    ? "Locked animals are protected from merging."
                    : "Unlocked and available for normal management."}
                </p>
                <div className="detail-actions">
                  <button
                    type="button"
                    onClick={() => toggleLock(selectedAnimal.id)}
                  >
                    {selectedAnimal.locked ? "Unlock" : "Lock"}
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlacement(selectedAnimal.id)}
                  >
                    {selectedAnimal.activeSlot === null
                      ? "Place on farm"
                      : "Move to storage"}
                  </button>
                  <button
                    className="primary-small"
                    type="button"
                    onClick={() => levelAnimal(selectedAnimal.id)}
                    disabled={serverActionPending || cloudStatus !== "synced"}
                  >
                    Level up ·{" "}
                    {animalLevelCost(selectedAnimal).toLocaleString()}
                  </button>
                </div>
              </section>
            </div>
            <div className="animal-browser">
              <button type="button" onClick={() => browseAnimal(-1)}>
                ← Previous
              </button>
              <span>
                {game.animals.findIndex(
                  (animal) => animal.id === selectedAnimal.id,
                ) + 1}{" "}
                of {game.animals.length}
              </span>
              <button type="button" onClick={() => browseAnimal(1)}>
                Next →
              </button>
            </div>
          </section>
        </div>
      )}

      {result && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setResult(null)}
        >
          <section
            className={`result-modal ${resultClass} ${result.kind === "batch" ? "batch-result-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setResult(null)}
            >
              ×
            </button>
            {result.kind === "animal" ? (
              <>
                <p className="eyebrow">The bell answered</p>
                <CreatureArt
                  speciesId={result.animal.speciesId}
                  variant={result.animal.variant}
                  size="hero"
                />
                <span className="result-rank">
                  {SPECIES[result.animal.speciesId].rank} ·{" "}
                  {VARIANTS[result.animal.variant].name}
                </span>
                <h2>{animalName(result.animal)}</h2>
                <p>Potential {result.animal.potential} · Level 1</p>
                <StatGrid animal={result.animal} />
                <div className="result-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      openAnimalDetail(result.animal.id);
                    }}
                  >
                    View animal
                  </button>
                  <button type="button" onClick={() => setResult(null)}>
                    Keep in storage
                  </button>
                </div>
              </>
            ) : result.kind === "batch" ? (
              <>
                <p className="eyebrow">Grand Summon complete</p>
                <h2>Your ten new creatures</h2>
                <p>
                  {result.newSpecies.length
                    ? `New discoveries: ${result.newSpecies.map((id) => SPECIES[id].name).join(", ")}`
                    : "All creatures were added to your collection."}
                </p>
                <div className="batch-result-grid">
                  {result.animals.map((animal) => (
                    <article
                      className={`rank-${SPECIES[animal.speciesId].rank.toLowerCase()} variant-${animal.variant}`}
                      key={animal.id}
                    >
                      <CreatureArt
                        speciesId={animal.speciesId}
                        variant={animal.variant}
                        size="small"
                      />
                      <strong>{SPECIES[animal.speciesId].name}</strong>
                      <small>
                        {VARIANTS[animal.variant].name} · P{animal.potential}
                      </small>
                    </article>
                  ))}
                </div>
                <div className="result-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      openView("animals");
                    }}
                  >
                    Open collection
                  </button>
                  <button type="button" onClick={() => setResult(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">Border Forge reward</p>
                <span className="result-emoji">
                  <Fence aria-hidden="true" />
                </span>
                <span className="result-rank">
                  {BORDERS[result.borderId].rarity}
                </span>
                <h2>{BORDERS[result.borderId].name}</h2>
                <p>
                  {result.duplicate
                    ? "Duplicate converted into 15 Fusion Dust."
                    : BORDERS[result.borderId].description}
                </p>
                <div className="result-actions">
                  <button
                    type="button"
                    disabled={result.duplicate}
                    onClick={() => {
                      equipBorder(result.borderId);
                      setResult(null);
                    }}
                  >
                    {result.duplicate ? "Already owned" : "Equip now"}
                  </button>
                  <button type="button" onClick={() => setResult(null)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {actionFeedback && (
        <div
          className={`action-feedback ${actionFeedback.tone}`}
          key={actionFeedback.key}
          role="status"
        >
          <span>{actionFeedback.tone === "earn" ? <Coins /> : actionFeedback.tone === "spend" ? <Hammer /> : <Sparkles />}</span>
          <strong>{actionFeedback.text}</strong>
        </div>
      )}
      <footer>
        <span>Protected Economy Alpha · trusted cloud actions</span>
        <button type="button" onClick={resetPrototype} disabled={serverActionPending || cloudStatus !== "synced"}>
          Reset alpha save
        </button>
      </footer>
    </main>
  );
}
