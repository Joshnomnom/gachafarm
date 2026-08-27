'use client';

import { type DragEvent, useEffect, useMemo, useState } from 'react';
import {
  BORDERS, BORDER_SUMMON_COST, RANK_ORDER, SPECIES, SUMMON_COST, TEN_PULL_COST, UPGRADES, VARIANTS,
  animalIncomePerMinute, autoPlaceBestAnimals, claimableIncome, createInitialGameState, farmIncomePerMinute,
  farmSlotCount, mergeAnimals, migrateGameState, summonAnimal, summonBorder, totalFarmMultiplier, upgradeCost,
  type AnimalInstance, type BorderId, type GameState, type Rank, type SpeciesId, type UpgradeId, type VariantId,
} from '../src/domain/game';

type View = 'farm' | 'summon' | 'animals' | 'merge' | 'upgrades' | 'visit';
type Banner = 'creature' | 'border';
type Result = { kind: 'animal'; animal: AnimalInstance } | { kind: 'batch'; animals: AnimalInstance[]; newSpecies: SpeciesId[] } | { kind: 'border'; borderId: BorderId; duplicate: boolean };
type CollectionSort = 'income' | 'potential' | 'newest' | 'name';
type CollectionStatus = 'all' | 'active' | 'stored' | 'locked';
type ActionTone = 'earn' | 'spend' | 'magic' | 'success';
type SummonReveal = { key: number; rarity: Rank; label: string };

const STORAGE_KEY = 'gachafarm.prototype.v1';
const statLabels = { yieldStat: 'Yield', tempoStat: 'Tempo', fortune: 'Fortune', heritage: 'Heritage' } as const;
const variantRevealRank: Record<VariantId, Rank> = { natural: 'Common', bronze: 'Rare', golden: 'Epic', diamond: 'Legendary', mystic: 'Mythic' };

function newId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function animalName(animal: AnimalInstance) { return `${VARIANTS[animal.variant].name} ${SPECIES[animal.speciesId].name}`; }
function perSecondIncome(animal: AnimalInstance, multiplier: number) {
  const value = animalIncomePerMinute(animal) * multiplier / 60;
  return value < 1 ? value.toFixed(2) : value.toFixed(1);
}
function animalRevealRank(animal: AnimalInstance) {
  const speciesRank = SPECIES[animal.speciesId].rank;
  const variantRank = variantRevealRank[animal.variant];
  return RANK_ORDER.indexOf(speciesRank) >= RANK_ORDER.indexOf(variantRank) ? speciesRank : variantRank;
}
function statDifference(value: number, comparison?: number) {
  if (comparison === undefined) return '';
  const difference = value - comparison;
  return difference === 0 ? '±0' : difference > 0 ? `+${difference}` : `${difference}`;
}

function CreatureArt({ speciesId, variant, size = 'medium', animated = false }: { speciesId: SpeciesId; variant?: AnimalInstance['variant']; size?: 'small' | 'medium' | 'large' | 'hero'; animated?: boolean }) {
  const index = SPECIES[speciesId].atlasIndex;
  const column = index % 3;
  const row = Math.floor(index / 3);
  return <span className={`creature-art art-${size} ${variant ? `art-${variant}` : ''} ${animated ? 'active-creature-art' : ''}`} role="img" aria-label={`${variant ? `${VARIANTS[variant].name} ` : ''}${SPECIES[speciesId].name}`}><span className="creature-sprite" style={{ backgroundPosition: `${column * 50}% ${row * 50}%` }}/></span>;
}

function StatGrid({ animal, comparison }: { animal: AnimalInstance; comparison?: AnimalInstance }) {
  return <div className="stat-grid">
    {(Object.keys(statLabels) as (keyof typeof statLabels)[]).map((stat) => <div key={stat}>
      <span>{statLabels[stat]}</span><strong>{animal[stat]}</strong>
      {comparison && <em>{statDifference(animal[stat], comparison[stat])}</em>}
    </div>)}
  </div>;
}

function AnimalCard({ animal, selected, valueRank, onSelect }: { animal: AnimalInstance; selected: boolean; valueRank: number; onSelect: () => void }) {
  const species = SPECIES[animal.speciesId];
  return <article className={`animal-info-card ${selected ? 'selected' : ''}`}>
    <div className="card-badges">
      <span className={`value-badge ${valueRank === 1 ? 'top-value' : ''}`}>{valueRank === 1 ? '♛ Top income' : `Value #${valueRank}`}</span>
      <span className={`rank-badge ${species.rank.toLowerCase()}`}>{species.rank}</span>
      <span className={`variant-badge ${animal.variant}`}>{VARIANTS[animal.variant].name}</span>
      {animal.locked && <span className="state-badge">Locked</span>}
    </div>
    <div className="animal-identity">
      <CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="medium" />
      <div><h3>{species.name}</h3><p>Level {animal.level} · Potential {animal.potential}</p></div>
    </div>
    <div className="production-strip"><span>Production</span><strong>+{animalIncomePerMinute(animal)} coins/min</strong></div>
    <StatGrid animal={animal} />
    <div className="card-footer"><span>{animal.activeSlot === null ? 'In storage' : `Active · Habitat ${animal.activeSlot + 1}`}</span><button type="button" onClick={onSelect}>{selected ? 'Selected' : 'View details'}</button></div>
  </article>;
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState(0));
  const [view, setView] = useState<View>('farm');
  const [banner, setBanner] = useState<Banner>('creature');
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState('Welcome to your first GachaFarm prototype.');
  const [result, setResult] = useState<Result | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animalDetailOpen, setAnimalDetailOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [farmAnimalId, setFarmAnimalId] = useState<string | null>(null);
  const [slotPicker, setSlotPicker] = useState<number | null>(null);
  const [movingAnimalId, setMovingAnimalId] = useState<string | null>(null);
  const [draggingAnimalId, setDraggingAnimalId] = useState<string | null>(null);
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([]);
  const [isSummoning, setIsSummoning] = useState(false);
  const [summonReveal, setSummonReveal] = useState<SummonReveal | null>(null);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionSort, setCollectionSort] = useState<CollectionSort>('income');
  const [rankFilter, setRankFilter] = useState<'all' | Rank>('all');
  const [variantFilter, setVariantFilter] = useState<'all' | VariantId>('all');
  const [statusFilter, setStatusFilter] = useState<CollectionStatus>('all');
  const [actionFeedback, setActionFeedback] = useState<{ key: number; icon: string; text: string; tone: ActionTone } | null>(null);
  const [upgradingId, setUpgradingId] = useState<UpgradeId | null>(null);

  useEffect(() => {
    const currentTime = Date.now();
    const saved = localStorage.getItem(STORAGE_KEY);
    let next = createInitialGameState(currentTime);
    let welcomeMessage: string | null = null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { version?: number };
        next = migrateGameState(parsed, currentTime) ?? next;
        if ((parsed.version ?? 0) < 3) welcomeMessage = 'Core Game Alpha unlocked! Your farm received a 5,000 coin launch grant.';
      } catch { /* use fresh state */ }
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setGame(next); setNow(currentTime); setHydrated(true); if (welcomeMessage) setMessage(welcomeMessage);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(game)); }, [game, hydrated]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  const farmSlots = farmSlotCount(game);
  const activeAnimals = useMemo(() => Array.from({ length: farmSlots }, (_, slot) => game.animals.find((animal) => animal.activeSlot === slot) ?? null), [farmSlots, game.animals]);
  const storageAnimals = game.animals.filter((animal) => animal.activeSlot === null);
  const storageByIncome = useMemo(() => game.animals.filter((animal) => animal.activeSlot === null).sort((a, b) => animalIncomePerMinute(b) - animalIncomePerMinute(a)), [game.animals]);
  const activeBorder = BORDERS[game.activeBorder];
  const farmMultiplier = totalFarmMultiplier(game);
  const incomeRate = farmIncomePerMinute(game.animals, farmMultiplier);
  const pendingIncome = now > 0 ? claimableIncome(game, now) : 0;
  const selectedAnimal = game.animals.find((animal) => animal.id === selectedId) ?? null;
  const farmAnimal = game.animals.find((animal) => animal.id === farmAnimalId) ?? null;
  const comparisonAnimal = selectedAnimal ? game.animals.filter((animal) => animal.id !== selectedAnimal.id && animal.speciesId === selectedAnimal.speciesId).sort((a, b) => animalIncomePerMinute(b) - animalIncomePerMinute(a))[0] : undefined;
  const mergeEligible = game.animals.filter((animal) => !animal.locked && animal.activeSlot === null);
  const selectedMergeAnimals = selectedMergeIds
    .map((id) => game.animals.find((animal) => animal.id === id))
    .filter((animal): animal is AnimalInstance => Boolean(animal));
  const mergeTemplate = selectedMergeAnimals[0];
  const compatibleMergeCount = mergeTemplate
    ? mergeEligible.filter((animal) => animal.speciesId === mergeTemplate.speciesId && animal.variant === mergeTemplate.variant).length
    : 0;
  const incomeValueRank = useMemo(() => new Map([...game.animals].sort((a, b) => animalIncomePerMinute(b) - animalIncomePerMinute(a) || b.potential - a.potential).map((animal, index) => [animal.id, index + 1])), [game.animals]);
  const visibleAnimals = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    const filtered = game.animals.filter((animal) => {
      const species = SPECIES[animal.speciesId];
      if (query && !animalName(animal).toLowerCase().includes(query)) return false;
      if (rankFilter !== 'all' && species.rank !== rankFilter) return false;
      if (variantFilter !== 'all' && animal.variant !== variantFilter) return false;
      if (statusFilter === 'active' && animal.activeSlot === null) return false;
      if (statusFilter === 'stored' && animal.activeSlot !== null) return false;
      if (statusFilter === 'locked' && !animal.locked) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (collectionSort === 'potential') return b.potential - a.potential || animalIncomePerMinute(b) - animalIncomePerMinute(a);
      if (collectionSort === 'newest') return b.createdAt - a.createdAt;
      if (collectionSort === 'name') return animalName(a).localeCompare(animalName(b));
      return animalIncomePerMinute(b) - animalIncomePerMinute(a) || b.potential - a.potential;
    });
  }, [collectionSearch, collectionSort, game.animals, rankFilter, statusFilter, variantFilter]);

  function showAction(icon: string, text: string, tone: ActionTone = 'success') {
    setActionFeedback({ key: Date.now(), icon, text, tone });
  }

  function claimIncome() {
    if (pendingIncome <= 0) { setMessage('Your animals are still gathering coins.'); return; }
    setGame((current) => ({ ...current, coins: current.coins + pendingIncome, lastClaimedAt: now }));
    setMessage(`Collected ${pendingIncome.toLocaleString()} idle coins.`);
    showAction('●', `+${pendingIncome.toLocaleString()} coins collected`, 'earn');
  }

  function placeAnimalInSlot(animalId: string, slot: number) {
    const target = game.animals.find((animal) => animal.id === animalId);
    if (!target) return;
    const occupant = game.animals.find((animal) => animal.activeSlot === slot && animal.id !== animalId);
    const previousSlot = target.activeSlot;
    setGame((current) => ({ ...current, animals: current.animals.map((animal) => {
      if (animal.id === animalId) return { ...animal, activeSlot: slot };
      if (occupant && animal.id === occupant.id) return { ...animal, activeSlot: previousSlot };
      return animal;
    }) }));
    setMessage(occupant ? `${animalName(target)} swapped habitats with ${animalName(occupant)}.` : `${animalName(target)} moved into habitat ${slot + 1}.`);
    showAction('↔', occupant ? 'Habitats swapped' : 'Creature placed');
    setMovingAnimalId(null); setSlotPicker(null); setFarmAnimalId(null);
  }

  function handleFarmSlot(slot: number, animal: AnimalInstance | null) {
    if (movingAnimalId) { placeAnimalInSlot(movingAnimalId, slot); return; }
    if (animal) setFarmAnimalId(animal.id); else setSlotPicker(slot);
  }

  function storeAnimal(animalId: string) {
    const animal = game.animals.find((item) => item.id === animalId);
    setGame((current) => ({ ...current, animals: current.animals.map((item) => item.id === animalId ? { ...item, activeSlot: null } : item) }));
    if (animal) setMessage(`${animalName(animal)} moved to storage.`);
    if (animal) showAction('📦', 'Moved to storage');
    setFarmAnimalId(null); setMovingAnimalId(null);
  }

  function beginMove(animalId: string) {
    setFarmAnimalId(null); setMovingAnimalId(animalId);
    setMessage('Move mode: click any habitat to place or swap this animal.');
  }

  function startAnimalDrag(event: DragEvent<HTMLElement>, animalId: string) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', animalId);
    setDraggingAnimalId(animalId);
  }

  function dropAnimalInSlot(event: DragEvent<HTMLElement>, slot: number) {
    event.preventDefault();
    const animalId = draggingAnimalId || event.dataTransfer.getData('text/plain');
    if (animalId) placeAnimalInSlot(animalId, slot);
    setDraggingAnimalId(null);
  }

  function dropAnimalInStorage(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const animalId = draggingAnimalId || event.dataTransfer.getData('text/plain');
    if (animalId) storeAnimal(animalId);
    setDraggingAnimalId(null);
  }

  function autoPlaceFarm() {
    setGame((current) => ({ ...current, animals: autoPlaceBestAnimals(current.animals, farmSlotCount(current)) }));
    setFarmAnimalId(null); setMovingAnimalId(null); setDraggingAnimalId(null);
    setMessage(`Auto Place selected your ${Math.min(farmSlots, game.animals.length)} highest-producing animals.`);
    showAction('🪄', 'Best-income farm assembled', 'magic');
  }

  function performSummon(quantity: 1 | 10 = 1) {
    const cost = banner === 'creature' ? (quantity === 10 ? TEN_PULL_COST : SUMMON_COST) : BORDER_SUMMON_COST;
    if (game.coins < cost || isSummoning) { setMessage(`You need ${cost.toLocaleString()} coins for this summon.`); return; }
    setIsSummoning(true); setSummonReveal(null); setMessage('The bell is answering…');
    if (banner === 'creature') {
      const border = BORDERS[game.activeBorder];
      const pulledAnimals: AnimalInstance[] = [];
      let nextPity = game.pity;
      const createdAt = Date.now();
      for (let index = 0; index < quantity; index += 1) {
        const pulled = summonAnimal(Math.random, newId('summon'), createdAt + index, nextPity, {
          dragonBonus: border.dragonBonus,
          goldenBonus: border.goldenBonus + (game.upgrades.luck - 1) * .01,
          minimumRank: quantity === 10 && index === 9 ? 'Rare' : undefined,
        });
        pulledAnimals.push(pulled.animal);
        nextPity = pulled.nextPity;
      }
      const newSpecies = [...new Set(pulledAnimals.map((animal) => animal.speciesId).filter((speciesId) => !game.discoveredSpecies.includes(speciesId)))];
      const nextResult: Result = quantity === 1 ? { kind: 'animal', animal: pulledAnimals[0] } : { kind: 'batch', animals: pulledAnimals, newSpecies };
      const bestAnimal = [...pulledAnimals].sort((a, b) => RANK_ORDER.indexOf(animalRevealRank(b)) - RANK_ORDER.indexOf(animalRevealRank(a)))[0];
      const revealRank = animalRevealRank(bestAnimal);
      const variantOutranksSpecies = RANK_ORDER.indexOf(variantRevealRank[bestAnimal.variant]) > RANK_ORDER.indexOf(SPECIES[bestAnimal.speciesId].rank);
      const revealLabel = quantity === 10 ? `Best pull · ${revealRank}` : variantOutranksSpecies ? `${VARIANTS[bestAnimal.variant].name} variant` : `${revealRank} creature`;
      setGame({ ...game, coins: game.coins - cost, pity: nextPity,
        discoveryStars: game.discoveryStars + newSpecies.length,
        discoveredSpecies: [...game.discoveredSpecies, ...newSpecies],
        summonHistory: [...pulledAnimals.map((animal) => ({ speciesId: animal.speciesId, variant: animal.variant, createdAt: animal.createdAt })), ...game.summonHistory].slice(0, 30),
        animals: [...game.animals, ...pulledAnimals] });
      window.setTimeout(() => {
        setSummonReveal({ key: Date.now(), rarity: revealRank, label: revealLabel }); setMessage(`${revealRank} falling star detected…`);
        window.setTimeout(() => {
          setResult(nextResult); if (quantity === 1) setSelectedId(pulledAnimals[0].id);
          setSummonReveal(null); setIsSummoning(false);
          setMessage(quantity === 10 ? `Ten creatures answered. ${newSpecies.length ? `${newSpecies.length} new species discovered!` : 'Collection expanded.'}` : `${animalName(pulledAnimals[0])} answered the bell.`);
        }, 1450);
      }, 520);
    } else {
      const pulled = summonBorder(Math.random, game.borderPity);
      const duplicate = game.ownedBorders.includes(pulled.borderId);
      const nextResult: Result = { kind: 'border', borderId: pulled.borderId, duplicate };
      const revealRank = BORDERS[pulled.borderId].rarity as Rank;
      setGame({ ...game, coins: game.coins - BORDER_SUMMON_COST, borderPity: pulled.nextPity,
        fusionDust: game.fusionDust + (duplicate ? 15 : 0),
        ownedBorders: duplicate ? game.ownedBorders : [...game.ownedBorders, pulled.borderId] });
      window.setTimeout(() => {
        setSummonReveal({ key: Date.now(), rarity: revealRank, label: `${revealRank} farm border` }); setMessage(`${revealRank} falling star detected…`);
        window.setTimeout(() => {
          setResult(nextResult); setSummonReveal(null); setIsSummoning(false);
          setMessage(duplicate ? `Duplicate ${BORDERS[pulled.borderId].name} became 15 Fusion Dust.` : `${BORDERS[pulled.borderId].name} joined your border collection.`);
        }, 1450);
      }, 520);
    }
  }

  function toggleLock(animalId: string) {
    setGame((current) => ({ ...current, animals: current.animals.map((animal) => animal.id === animalId ? { ...animal, locked: !animal.locked } : animal) }));
  }

  function togglePlacement(animalId: string) {
    const target = game.animals.find((animal) => animal.id === animalId);
    if (!target) return;
    if (target.activeSlot !== null) { storeAnimal(animalId); return; }
    const used = new Set(game.animals.map((animal) => animal.activeSlot).filter((slot) => slot !== null));
    const free = Array.from({ length: farmSlots }, (_, index) => index).find((slot) => !used.has(slot));
    if (free === undefined) { setMessage('All habitats are occupied. Use the Farm screen to choose an animal to swap.'); openView('farm'); return; }
    placeAnimalInSlot(animalId, free);
  }

  function levelAnimal(animalId: string) {
    const animal = game.animals.find((candidate) => candidate.id === animalId);
    if (!animal) return;
    const cost = animal.level * 240;
    if (game.coins < cost) { setMessage(`You need ${cost.toLocaleString()} coins for the next level.`); return; }
    setGame((current) => ({ ...current, coins: current.coins - cost, animals: current.animals.map((candidate) => candidate.id === animalId ? { ...candidate, level: candidate.level + 1 } : candidate) }));
    setMessage(`${animalName(animal)} reached level ${animal.level + 1}.`);
    showAction('🌟', `${animalName(animal)} leveled up`, 'spend');
  }

  function purchaseUpgrade(upgradeId: UpgradeId) {
    const definition = UPGRADES[upgradeId];
    const currentLevel = game.upgrades[upgradeId];
    if (currentLevel >= definition.maxLevel) { setMessage(`${definition.name} is already at maximum level.`); return; }
    const cost = upgradeCost(upgradeId, currentLevel);
    if (game.coins < cost) { setMessage(`You need ${cost.toLocaleString()} coins for ${definition.name}.`); return; }
    setGame((current) => ({ ...current, coins: current.coins - cost, upgrades: { ...current.upgrades, [upgradeId]: current.upgrades[upgradeId] + 1 } }));
    setMessage(`${definition.name} upgraded to level ${currentLevel + 1}.`);
    setUpgradingId(upgradeId);
    window.setTimeout(() => setUpgradingId(null), 850);
    showAction('🛠️', `${definition.name} · Level ${currentLevel + 1}`, 'spend');
  }

  function toggleMergeAnimal(animal: AnimalInstance) {
    if (selectedMergeIds.includes(animal.id)) {
      setSelectedMergeIds((current) => current.filter((id) => id !== animal.id));
      setMessage(`${animalName(animal)} removed from the merge tray.`);
      return;
    }
    if (selectedMergeIds.length >= 3) {
      setMessage('The merge tray is full. Remove one animal before choosing another.');
      return;
    }
    if (mergeTemplate && (animal.speciesId !== mergeTemplate.speciesId || animal.variant !== mergeTemplate.variant)) {
      setMessage(`Choose another ${animalName(mergeTemplate)}. Merge parents must match.`);
      return;
    }
    setSelectedMergeIds((current) => [...current, animal.id]);
    setMessage(`${animalName(animal)} added as parent ${selectedMergeIds.length + 1} of 3.`);
  }

  function autoFillMerge() {
    let pool: AnimalInstance[] = [];
    if (mergeTemplate) {
      pool = mergeEligible.filter((animal) => animal.speciesId === mergeTemplate.speciesId && animal.variant === mergeTemplate.variant);
    } else {
      const groups = new Map<string, AnimalInstance[]>();
      mergeEligible.forEach((animal) => {
        const key = `${animal.speciesId}:${animal.variant}`;
        groups.set(key, [...(groups.get(key) ?? []), animal]);
      });
      const viable = [...groups.values()].filter((group) => group.length >= 3);
      viable.forEach((group) => group.sort((a, b) => animalIncomePerMinute(a) - animalIncomePerMinute(b) || a.potential - b.potential));
      viable.sort((a, b) => a.slice(0, 3).reduce((sum, animal) => sum + animalIncomePerMinute(animal), 0) - b.slice(0, 3).reduce((sum, animal) => sum + animalIncomePerMinute(animal), 0));
      pool = viable[0] ?? [];
    }
    pool.sort((a, b) => animalIncomePerMinute(a) - animalIncomePerMinute(b) || a.potential - b.potential);
    const preserved = selectedMergeAnimals.filter((animal) => pool.some((candidate) => candidate.id === animal.id));
    const chosen = [...preserved, ...pool.filter((animal) => !preserved.some((candidate) => candidate.id === animal.id))].slice(0, 3);
    if (chosen.length < 3) {
      setMessage(mergeTemplate ? `You need ${3 - chosen.length} more stored ${animalName(mergeTemplate)} for autofill.` : 'No stored bloodline has three unlocked matching creatures yet.');
      return;
    }
    setSelectedMergeIds(chosen.map((animal) => animal.id));
    setMessage(`Autofill chose three ${animalName(chosen[0])} parents, protecting higher-value copies when possible.`);
    showAction('🧬', 'Merge tray autofilled', 'magic');
  }

  function performMerge() {
    if (selectedMergeAnimals.length !== 3) {
      setMessage(`Choose ${3 - selectedMergeAnimals.length} more matching animal${selectedMergeAnimals.length === 2 ? '' : 's'} first.`);
      return;
    }
    const parents = selectedMergeAnimals;
    const merged = mergeAnimals(parents, Math.random, newId('merge'), now);
    const ids = new Set(parents.map((animal) => animal.id));
    setGame((current) => ({ ...current, animals: [...current.animals.filter((animal) => !ids.has(animal.id)), merged], fusionDust: current.fusionDust + 5 }));
    setSelectedMergeIds([]); setSelectedId(merged.id); setResult({ kind: 'animal', animal: merged }); setMessage(`Merge complete: ${animalName(merged)} with Potential ${merged.potential}.`);
    showAction('🧬', `${animalName(merged)} created`, 'magic');
  }

  function equipBorder(borderId: BorderId) {
    setGame((current) => ({ ...current, activeBorder: borderId }));
    setMessage(`${BORDERS[borderId].name} is now active on your farm.`);
    showAction(BORDERS[borderId].icon, `${BORDERS[borderId].name} equipped`);
  }

  function resetPrototype() {
    setGame(createInitialGameState(Date.now())); setView('farm'); setSelectedId(null); setAnimalDetailOpen(false); setSelectedMergeIds([]); setResult(null);
    setMessage('Prototype reset. Your starter animals are ready.');
  }

  function openAnimalDetail(animalId: string) {
    setSelectedId(animalId);
    setAnimalDetailOpen(true);
  }

  function browseAnimal(direction: -1 | 1) {
    if (!selectedAnimal) return;
    const currentIndex = game.animals.findIndex((animal) => animal.id === selectedAnimal.id);
    const nextIndex = (currentIndex + direction + game.animals.length) % game.animals.length;
    setSelectedId(game.animals[nextIndex].id);
  }

  function openView(nextView: View) {
    setView(nextView);
    window.requestAnimationFrame(() => document.getElementById('game-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const heroTitle = view === 'farm' ? 'Build a farm worthy of legends.' : view === 'summon' ? 'Nine species. Five dazzling forms.' : view === 'animals' ? 'Complete the creature archive.' : view === 'merge' ? 'Choose the bloodline yourself.' : view === 'upgrades' ? 'Grow from meadow to menagerie.' : 'A wider world is coming.';
  const resultClass = result?.kind === 'animal' ? result.animal.variant : result?.kind === 'border' ? BORDERS[result.borderId].rarity.toLowerCase() : result?.kind === 'batch' ? 'batch' : '';

  return <main className="game-shell">
    <header className="topbar">
      <button className="brand brand-button" type="button" onClick={() => openView('farm')} aria-label="Open GachaFarm"><span className="brand-mark">GF</span><span><strong>GachaFarm</strong><small>Raise the impossible</small></span></button>
      <div className="resources" aria-label="Farm resources"><span className="resource-pill coin-pill"><b>●</b> {game.coins.toLocaleString()}</span><span className="resource-pill" title="Discovery Stars"><b>✦</b> {game.discoveryStars}</span><span className="resource-pill" title="Fusion Dust"><b>◇</b> {game.fusionDust}</span><button className="profile-button" type="button">LV. 3</button></div>
    </header>

    <section className="hero-strip"><div><p className="eyebrow">Core Game Alpha · Collection Season 1</p><h1>{heroTitle}</h1></div><button className="claim-button" type="button" onClick={claimIncome}><span>{pendingIncome > 0 ? 'Idle income ready' : 'Animals are producing'}</span><strong>{pendingIncome > 0 ? `Claim ${pendingIncome.toLocaleString()} coins` : `${incomeRate} coins/min`}</strong></button></section>

    <div className="game-layout" id="game-content">
      <nav className="side-nav" aria-label="Game navigation">
        {([['farm','🏡','Farm'],['summon','🔔','Summon'],['animals','🐾','Animals'],['merge','🧬','Merge'],['upgrades','🛠️','Upgrade'],['visit','🌎','Visit']] as [View,string,string][]).map(([id, icon, label]) => <button key={id} className={view === id ? 'active' : ''} type="button" onClick={() => openView(id)}><span className="nav-sticker" aria-hidden="true">{icon}</span>{label}</button>)}
      </nav>

      {view === 'farm' && <section className="farm-card wide-card" aria-labelledby="farm-title">
        <div className="farm-heading"><div><p className="eyebrow">Active habitat · {game.animals.filter((animal) => animal.activeSlot !== null).length}/{farmSlots}</p><h2 id="farm-title">Sunnybrook Farm</h2><small className="border-label">{activeBorder.icon} {activeBorder.name} · {activeBorder.description}</small></div><div className="farm-heading-actions"><div className="income-rate"><span>Farm income · Workshop Lv.{game.upgrades.production}</span><strong>{incomeRate} coins/min</strong></div><button className="auto-place-button" type="button" onClick={autoPlaceFarm}><span>🪄</span><b>Auto Place</b><small>Best income</small></button></div></div>
        {movingAnimalId && <div className="move-mode"><span>↔ Click or drop on a habitat to place {animalName(game.animals.find((animal) => animal.id === movingAnimalId)!)}.</span><button type="button" onClick={() => setMovingAnimalId(null)}>Cancel</button></div>}
        <div className={`farm-field border-${game.activeBorder}`}><div className="sun" aria-hidden="true"/><div className="cloud cloud-one" aria-hidden="true"/><div className="cloud cloud-two" aria-hidden="true"/><div className="barn" aria-hidden="true"><span className="barn-roof"/><span className="barn-body"><i/></span></div><div className="farm-border-frame" aria-hidden="true"><span>{activeBorder.icon}</span><span>{activeBorder.icon}</span><span>{activeBorder.icon}</span><span>{activeBorder.icon}</span></div><div className="equipped-border-flag"><span>{activeBorder.icon}</span><div><small>Equipped border</small><strong>{activeBorder.name}</strong></div></div>
          <div className="animal-grid">{activeAnimals.map((animal, index) => <button className={`animal-slot ${animal ? 'occupied' : ''} ${movingAnimalId || draggingAnimalId ? 'move-target' : ''} ${draggingAnimalId === animal?.id ? 'dragging' : ''}`} type="button" key={index} draggable={Boolean(animal)} onDragStart={animal ? (event) => startAnimalDrag(event, animal.id) : undefined} onDragEnd={() => setDraggingAnimalId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => dropAnimalInSlot(event, index)} onClick={() => handleFarmSlot(index, animal)} aria-label={animal ? `${animalName(animal)}, habitat ${index + 1}. Drag to move or click for details.` : `Empty habitat ${index + 1}. Drop or click to place an animal.`}>
            {animal ? <><span className={`variant-tag ${animal.variant}`}>{VARIANTS[animal.variant].name}</span>{animal.locked && <span className="lock-corner">◆</span>}<span className="animal-stage"><span className="animal-shadow"/><CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="large" animated />{now > 0 && <span className="income-pop" key={`${animal.id}-${Math.floor(now / 1000)}`} aria-hidden="true">● +{perSecondIncome(animal, farmMultiplier)}</span>}</span><strong className="farm-animal-name">{animalName(animal)}</strong><small>Habitat {index + 1} · {animalIncomePerMinute(animal)}/min · P{animal.potential}</small></> : <><span className="empty-plus">+</span><strong>Empty habitat</strong><small>Drop or click to place</small></>}
          </button>)}</div>
        </div><section className={`farm-storage ${draggingAnimalId ? 'drop-ready' : ''}`} aria-label="Farm storage" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={dropAnimalInStorage}><div className="farm-storage-heading"><div><span>Farm storage</span><strong>{storageByIncome.length} creatures waiting</strong></div><small>Drag a creature onto a habitat · drop active creatures here to store</small></div>{storageByIncome.length ? <div className="farm-storage-row">{storageByIncome.map((animal) => <button className={draggingAnimalId === animal.id ? 'dragging' : ''} type="button" draggable onDragStart={(event) => startAnimalDrag(event, animal.id)} onDragEnd={() => setDraggingAnimalId(null)} onClick={() => beginMove(animal.id)} key={animal.id}><CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="small"/><span><strong>{animalName(animal)}</strong><small>+{animalIncomePerMinute(animal)}/min · tap to place</small></span><b>⠿</b></button>)}</div> : <div className="farm-storage-empty">Every owned creature is active. Drag one here to store it.</div>}</section><p className="status-message" role="status" aria-live="polite">{message}</p>
      </section>}

      {view === 'summon' && <section className={`summon-screen wide-card ${isSummoning ? 'summoning' : ''} ${summonReveal ? `revealing rarity-${summonReveal.rarity.toLowerCase()}` : ''}`} aria-labelledby="summon-title">
        <div className="summon-sky"><span className="summon-star star-one">✦</span><span className="summon-star star-two">✧</span><span className="summon-star star-three">✦</span><div className="magic-rings"><span/><span/><div className="great-bell">{banner === 'creature' ? '🔔' : '🪄'}</div></div>{summonReveal && <div className={`summon-reveal rarity-${summonReveal.rarity.toLowerCase()}`} key={summonReveal.key} aria-live="assertive"><div className="fallen-star"><span>✦</span></div><div className="star-impact"><span/>{Array.from({ length: 8 }, (_, index) => <i key={index}/>)}</div><div className="falling-star-label"><small>Falling star</small><strong>{summonReveal.label}</strong></div></div>}</div>
        <div className="summon-content"><p className="eyebrow">The Grand Gacha Hall</p><h2 id="summon-title">Choose what answers the bell</h2><p>Creature banners grow your herd. Border banners unlock permanent farm styles and gameplay boosts.</p>
          <div className="banner-tabs"><button className={banner === 'creature' ? 'active' : ''} type="button" onClick={() => setBanner('creature')}><span>🐉</span><b>Creature Bell</b><small>Animals with unique stats</small></button><button className={banner === 'border' ? 'active' : ''} type="button" onClick={() => setBanner('border')}><span>🌠</span><b>Border Forge</b><small>Farm looks + passive boosts</small></button></div>
          <div className="banner-details">
            {banner === 'creature' ? <><div><span>Species ranks</span><strong>5% Mythic · 7% Legendary</strong><small>Ten-pull guarantees Rare or better in slot 10</small></div><div><span>Five variants</span><strong>Mystic 2% · Diamond 5%</strong><small>Golden 10% · Bronze 18% · Natural 65%</small></div><div><span>Mythic guarantee</span><strong>{game.pity + 1}/20 pulls</strong><small>Active luck bonus +{(game.upgrades.luck - 1) + activeBorder.goldenBonus * 100}% premium chance</small></div></> : <><div><span>Featured reward</span><strong>🌠 Starfall Fence · 5%</strong><small>Boosts Mythic rate by +2%</small></div><div><span>Duplicate reward</span><strong>◇ 15 Fusion Dust</strong><small>No pull is completely wasted</small></div><div><span>Legendary guarantee</span><strong>{game.borderPity + 1}/15 pulls</strong><small>Guaranteed Starfall on pull 15</small></div></>}
          </div>
          <div className="summon-actions"><button className={`summon-main-button action-control ${isSummoning ? 'activated' : ''}`} type="button" disabled={isSummoning} onClick={() => performSummon(1)}><span>{isSummoning ? 'The magic is gathering…' : banner === 'creature' ? 'Summon ×1' : 'Forge a Farm Border'}</span><strong>● {(banner === 'creature' ? SUMMON_COST : BORDER_SUMMON_COST).toLocaleString()}</strong></button>{banner === 'creature' && <button className={`ten-pull-button action-control ${isSummoning ? 'activated' : ''}`} type="button" disabled={isSummoning} onClick={() => performSummon(10)}><span>Grand Summon ×10</span><strong>● {TEN_PULL_COST.toLocaleString()}</strong><small>Save 500 · Rare+ guaranteed</small></button>}</div>
          <p className="rate-note">Rates shown are exact for this prototype. Summons are purchased only with earned game coins.</p>
          <div className="border-collection"><div className="section-heading compact"><div><p className="eyebrow">Owned styles</p><h3>Your farm borders</h3></div><span className="count-badge">{game.ownedBorders.length}/{Object.keys(BORDERS).length}</span></div><div className="border-grid">{game.ownedBorders.map((id) => <article className={game.activeBorder === id ? 'active' : ''} key={id}><div className={`border-swatch border-${id}`}><span>{BORDERS[id].icon}</span></div><div><strong>{BORDERS[id].name}</strong><small>{BORDERS[id].description}</small></div><button type="button" disabled={game.activeBorder === id} onClick={() => equipBorder(id)}>{game.activeBorder === id ? 'Equipped' : 'Equip'}</button></article>)}</div></div>
        </div><p className="status-message" role="status">{message}</p>
      </section>}

      {view === 'animals' && <section className="farm-card manage-card wide-card" aria-labelledby="collection-title">
        <div className="section-heading"><div><p className="eyebrow">Owned collection</p><h2 id="collection-title">Your animals</h2></div><div className="heading-actions"><span className="count-badge">{game.animals.length} owned</span><button className="archive-button" type="button" onClick={() => setArchiveOpen(true)}>📖 Open Creature Archive</button></div></div>
        <div className="collection-guide"><span>Highest-income creatures appear first by default.</span><strong>{visibleAnimals.length} creature{visibleAnimals.length === 1 ? '' : 's'} shown</strong></div>
        <div className="collection-filters" aria-label="Animal collection filters"><label className="collection-search"><span>Search</span><input value={collectionSearch} onChange={(event) => setCollectionSearch(event.target.value)} placeholder="Cow, Mystic, Dragon…"/></label><label><span>Sort</span><select value={collectionSort} onChange={(event) => setCollectionSort(event.target.value as CollectionSort)}><option value="income">Income · highest</option><option value="potential">Potential · highest</option><option value="newest">Newest first</option><option value="name">Name · A–Z</option></select></label><label><span>Rank</span><select value={rankFilter} onChange={(event) => setRankFilter(event.target.value as 'all' | Rank)}><option value="all">All ranks</option>{RANK_ORDER.map((rank) => <option value={rank} key={rank}>{rank}</option>)}</select></label><label><span>Variant</span><select value={variantFilter} onChange={(event) => setVariantFilter(event.target.value as 'all' | VariantId)}><option value="all">All variants</option>{(Object.keys(VARIANTS) as VariantId[]).map((variant) => <option value={variant} key={variant}>{VARIANTS[variant].name}</option>)}</select></label><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CollectionStatus)}><option value="all">Any status</option><option value="active">Active farm</option><option value="stored">In storage</option><option value="locked">Locked</option></select></label><button type="button" onClick={() => { setCollectionSearch(''); setCollectionSort('income'); setRankFilter('all'); setVariantFilter('all'); setStatusFilter('all'); }}>Reset</button></div>
        {visibleAnimals.length ? <div className="collection-grid">{visibleAnimals.map((animal) => <AnimalCard key={animal.id} animal={animal} selected={selectedId === animal.id} valueRank={incomeValueRank.get(animal.id) ?? game.animals.length} onSelect={() => openAnimalDetail(animal.id)}/>)}</div> : <div className="collection-empty"><span>⌕</span><h3>No creatures match</h3><p>Try removing a filter or searching for another name.</p><button type="button" onClick={() => { setCollectionSearch(''); setRankFilter('all'); setVariantFilter('all'); setStatusFilter('all'); }}>Clear filters</button></div>}<p className="status-message" role="status">{message}</p>
      </section>}

      {view === 'merge' && <section className="farm-card manage-card wide-card"><div className="section-heading"><div><p className="eyebrow">Manual species merge</p><h2>Choose your three parents</h2></div><span className="count-badge">◇ {game.fusionDust}</span></div><div className="merge-explainer"><span>1. Pick an animal</span><b>→</b><span>2. Pick two matching copies</span><b>→</b><span>3. Confirm merge</span></div>
        <div className="merge-workbench"><section className="merge-tray" aria-label="Selected merge parents"><div className="merge-tray-heading"><div><span>Merge tray</span><strong>{selectedMergeAnimals.length}/3 selected</strong></div><div className="merge-tray-actions"><button className="autofill-merge-button action-control" type="button" onClick={autoFillMerge}>🧬 Auto Fill</button>{selectedMergeAnimals.length > 0 && <button type="button" onClick={() => setSelectedMergeIds([])}>Clear all</button>}</div></div><div className="merge-slots">{Array.from({ length: 3 }, (_, index) => { const animal = selectedMergeAnimals[index]; return <div className={animal ? 'filled' : ''} key={index}><span className="merge-slot-number">{index + 1}</span>{animal ? <><CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="small"/><strong>{animalName(animal)}</strong><small>P{animal.potential} · +{animalIncomePerMinute(animal)}/min</small><button type="button" onClick={() => toggleMergeAnimal(animal)}>Remove</button></> : <><span className="merge-slot-plus">+</span><strong>Choose parent {index + 1}</strong><small>{mergeTemplate ? `Needs ${animalName(mergeTemplate)}` : 'Any stored animal'}</small></>}</div>; })}<span className="merge-arrow">→</span><div className="merge-result-preview"><span>?</span><strong>{mergeTemplate ? animalName(mergeTemplate) : 'New offspring'}</strong><small>Best parent stats · possible next variant</small></div></div><button className="confirm-merge-button action-control" type="button" disabled={selectedMergeAnimals.length !== 3} onClick={performMerge}>{selectedMergeAnimals.length === 3 ? 'Merge these 3 animals' : `Choose ${3 - selectedMergeAnimals.length} more`}</button></section>
          <section className="merge-picker"><div className="merge-picker-heading"><div><span>Eligible storage</span><strong>{mergeEligible.length} unlocked animals</strong></div>{mergeTemplate && <small>{compatibleMergeCount} matching {animalName(mergeTemplate)} owned</small>}</div>{mergeEligible.length ? <div className="merge-select-grid">{mergeEligible.map((animal) => { const selectedIndex = selectedMergeIds.indexOf(animal.id); const compatible = !mergeTemplate || (animal.speciesId === mergeTemplate.speciesId && animal.variant === mergeTemplate.variant); return <button type="button" className={`${selectedIndex >= 0 ? 'selected' : ''} ${!compatible ? 'incompatible' : ''}`} key={animal.id} onClick={() => toggleMergeAnimal(animal)} aria-pressed={selectedIndex >= 0}><span className="merge-check">{selectedIndex >= 0 ? selectedIndex + 1 : '+'}</span><CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="small"/><strong>{animalName(animal)}</strong><small>Level {animal.level} · Potential {animal.potential}</small><span className="merge-pick-stats">Yield {animal.yieldStat} · Tempo {animal.tempoStat}</span></button>; })}</div> : <div className="empty-state"><span>🧬</span><h3>No eligible animals</h3><p>Move animals to storage and unlock them before merging.</p><button type="button" onClick={() => openView('animals')}>Open Animals</button></div>}</section>
        </div><p className="status-message">{message}</p></section>}

      {view === 'upgrades' && <section className="farm-card manage-card wide-card"><div className="section-heading"><div><p className="eyebrow">Farm workshop · rebalanced</p><h2>Permanent upgrades</h2></div><span className="count-badge">● {game.coins.toLocaleString()}</span></div><div className="economy-note"><span>Longer progression</span><strong>Workshop prices now scale more sharply after every level.</strong><p>Choose between summoning now or saving for a meaningful permanent boost.</p></div><div className="upgrade-summary"><div><span>Habitats</span><strong>{farmSlots}</strong></div><div><span>Production bonus</span><strong>+{(game.upgrades.production - 1) * 10}%</strong></div><div><span>Offline capacity</span><strong>{4 + (game.upgrades.offline - 1) * 2}h</strong></div><div><span>Premium luck</span><strong>+{game.upgrades.luck - 1}%</strong></div></div><div className="upgrade-grid">{Object.values(UPGRADES).map((upgrade) => { const level = game.upgrades[upgrade.id]; const maxed = level >= upgrade.maxLevel; const cost = upgradeCost(upgrade.id, level); return <article className={upgradingId === upgrade.id ? 'upgrade-success' : ''} key={upgrade.id}><span className={`upgrade-icon upgrade-icon-${upgrade.id}`}>{upgrade.icon}</span><div className="upgrade-copy"><small>Level {level}/{upgrade.maxLevel}</small><h3>{upgrade.name}</h3><p>{upgrade.description}</p><div className="level-pips">{Array.from({ length: upgrade.maxLevel }, (_, index) => <span className={index < level ? 'filled' : ''} key={index}/>)}</div></div><button className="action-control" type="button" disabled={maxed} onClick={() => purchaseUpgrade(upgrade.id)}>{maxed ? 'Max level' : <>Upgrade <b>● {cost.toLocaleString()}</b></>}</button></article>; })}</div><section className="alpha-goals"><div className="section-heading compact"><div><p className="eyebrow">Season goals</p><h3>Meadow League milestones</h3></div><span className="count-badge">Alpha</span></div><div className="goal-grid"><article><span>Own 10 creatures</span><strong>{Math.min(game.animals.length, 10)}/10</strong><progress max="10" value={Math.min(game.animals.length, 10)}/></article><article><span>Discover 5 species</span><strong>{Math.min(game.discoveredSpecies.length, 5)}/5</strong><progress max="5" value={Math.min(game.discoveredSpecies.length, 5)}/></article><article><span>Reach 200 coins/min</span><strong>{Math.min(incomeRate, 200)}/200</strong><progress max="200" value={Math.min(incomeRate, 200)}/></article></div></section><section className="future-upgrades"><div className="section-heading compact"><div><p className="eyebrow">Next workshop tiers</p><h3>Planned progression</h3></div><span className="count-badge muted-badge">Coming later</span></div><div className="future-upgrade-grid"><article><span>🧬</span><div><strong>Species Mastery</strong><small>Invest in your favorite bloodline for species-specific income perks.</small></div><b>Tier II</b></article><article><span>🎨</span><div><strong>Border Refinery</strong><small>Fuse duplicate borders to strengthen their passive bonuses.</small></div><b>Tier II</b></article><article><span>🤖</span><div><strong>Farm Caretaker</strong><small>Save farm loadouts and automate selected management tasks.</small></div><b>Tier III</b></article><article><span>🌟</span><div><strong>Sanctuary Ascension</strong><small>Late-game prestige resets for permanent account-wide power.</small></div><b>Endgame</b></article></div></section><p className="status-message">{message}</p></section>}

      {view === 'visit' && <section className="farm-card manage-card wide-card"><div className="section-heading"><div><p className="eyebrow">Multiplayer preview</p><h2>Visit another farm</h2></div><span className="count-badge muted-badge">Database next</span></div><div className="visit-preview"><div className="visit-landscape"><span>🐮</span><span>🐉</span></div><div><h3>Cloud save will unlock visiting</h3><p>The playable loop is browser-local today. Supabase is the planned free-tier backend for accounts, saved farms, profiles, and read-only visits.</p><ul><li>See a friend&apos;s active animals and equipped border.</li><li>Compare income and collection discoveries.</li><li>Leave a lightweight guest-book reaction later.</li></ul></div></div><p className="status-message">No crop farming—animals, collecting, merging, decorating, and social discovery stay at the center.</p></section>}
    </div>

    {archiveOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setArchiveOpen(false)}><section className="picker-modal archive-modal" role="dialog" aria-modal="true" aria-labelledby="archive-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setArchiveOpen(false)}>×</button><div className="archive-header"><div><p className="eyebrow">Season 1 collection</p><h2 id="archive-title">Creature Archive</h2><p>Discover every species and collect all five material variants.</p></div><div className="archive-progress"><strong>{game.discoveredSpecies.length}/{Object.keys(SPECIES).length}</strong><span>species discovered</span><progress max={Object.keys(SPECIES).length} value={game.discoveredSpecies.length}/></div></div><div className="archive-ranks">{RANK_ORDER.map((rank) => { const rankSpecies = Object.values(SPECIES).filter((species) => species.rank === rank); return <section key={rank}><div className="archive-rank-heading"><span className={`rank-badge ${rank.toLowerCase()}`}>{rank}</span><small>{rankSpecies.filter((species) => game.discoveredSpecies.includes(species.id)).length}/{rankSpecies.length} found</small></div><div className="archive-species-grid">{rankSpecies.map((species) => { const discovered = game.discoveredSpecies.includes(species.id); const owned = game.animals.filter((animal) => animal.speciesId === species.id); const ownedVariants = new Set(owned.map((animal) => animal.variant)); return <article className={`${discovered ? 'discovered' : 'unknown'} rank-${rank.toLowerCase()}`} key={species.id}>{discovered ? <CreatureArt speciesId={species.id} size="medium" /> : <span className="archive-silhouette">?</span>}<div className="archive-species-copy"><h3>{discovered ? species.name : 'Unknown creature'}</h3><p>{discovered ? `${owned.length} owned · ${ownedVariants.size}/5 variants` : `${species.summonWeight}% base summon rate`}</p><div className="variant-discovery">{(Object.keys(VARIANTS) as AnimalInstance['variant'][]).map((variant) => <span className={`${ownedVariants.has(variant) ? 'owned' : ''} ${variant}`} title={`${VARIANTS[variant].name}${ownedVariants.has(variant) ? ' owned' : ' missing'}`} key={variant}/>)}</div></div></article>; })}</div></section>; })}</div><div className="archive-footer"><span>✦ New species award one Discovery Star.</span><button type="button" onClick={() => setArchiveOpen(false)}>Back to Animals</button></div></section></div>}

    {slotPicker !== null && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSlotPicker(null)}><section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setSlotPicker(null)}>×</button><p className="eyebrow">Habitat {slotPicker + 1}</p><h2 id="picker-title">Choose an animal to place</h2><p className="modal-intro">Pick directly from storage. You can move it again by clicking its farm habitat.</p>{storageAnimals.length ? <div className="picker-list">{storageAnimals.map((animal) => <button type="button" key={animal.id} onClick={() => placeAnimalInSlot(animal.id, slotPicker)}><CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="small"/><div><strong>{animalName(animal)}</strong><small>Level {animal.level} · P{animal.potential}</small></div><b>+{animalIncomePerMinute(animal)}/min</b></button>)}</div> : <div className="empty-state"><span>📦</span><h3>Storage is empty</h3><p>Summon another creature or move an active animal.</p></div>}</section></div>}

    {farmAnimal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setFarmAnimalId(null)}><section className="picker-modal animal-modal" role="dialog" aria-modal="true" aria-labelledby="farm-animal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setFarmAnimalId(null)}>×</button><div className="detail-identity"><CreatureArt speciesId={farmAnimal.speciesId} variant={farmAnimal.variant} size="large"/><div><small>Habitat {(farmAnimal.activeSlot ?? 0) + 1}</small><h2 id="farm-animal-title">{animalName(farmAnimal)}</h2><p>{SPECIES[farmAnimal.speciesId].rank} · Level {farmAnimal.level} · Potential {farmAnimal.potential}</p></div></div><div className="production-strip"><span>Production</span><strong>+{animalIncomePerMinute(farmAnimal)} coins/min</strong></div><h4>Genetic stats</h4><StatGrid animal={farmAnimal}/><div className="modal-action-row"><button type="button" onClick={() => storeAnimal(farmAnimal.id)}>Move to storage</button><button className="primary-small" type="button" onClick={() => beginMove(farmAnimal.id)}>Move or swap</button><button type="button" onClick={() => { setFarmAnimalId(null); openAnimalDetail(farmAnimal.id); }}>Full details</button></div></section></div>}

    {animalDetailOpen && selectedAnimal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setAnimalDetailOpen(false)}><section className="picker-modal animal-detail-modal" role="dialog" aria-modal="true" aria-labelledby="animal-detail-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setAnimalDetailOpen(false)}>×</button><div className="animal-detail-top"><div className="detail-identity"><CreatureArt speciesId={selectedAnimal.speciesId} variant={selectedAnimal.variant} size="large"/><div><small>{SPECIES[selectedAnimal.speciesId].rank} · {VARIANTS[selectedAnimal.variant].name}</small><h2 id="animal-detail-title">{animalName(selectedAnimal)}</h2><p>Level {selectedAnimal.level} · Potential {selectedAnimal.potential}</p></div></div><span className={`detail-status ${selectedAnimal.activeSlot === null ? 'stored' : 'active'}`}>{selectedAnimal.activeSlot === null ? 'In storage' : `Habitat ${selectedAnimal.activeSlot + 1}`}</span></div><div className="animal-detail-sections"><section><h3>Production</h3><strong className="big-production">+{animalIncomePerMinute(selectedAnimal)} coins/min</strong><p>Yield and Tempo directly affect this animal&apos;s idle income.</p></section><section><h3>Genetic stats</h3><StatGrid animal={selectedAnimal} comparison={comparisonAnimal}/><p>Green numbers compare against your strongest matching species.</p></section><section><h3>Management</h3><p>{selectedAnimal.locked ? 'Locked animals are protected from merging.' : 'Unlocked and available for normal management.'}</p><div className="detail-actions"><button type="button" onClick={() => toggleLock(selectedAnimal.id)}>{selectedAnimal.locked ? 'Unlock' : 'Lock'}</button><button type="button" onClick={() => togglePlacement(selectedAnimal.id)}>{selectedAnimal.activeSlot === null ? 'Place on farm' : 'Move to storage'}</button><button className="primary-small" type="button" onClick={() => levelAnimal(selectedAnimal.id)}>Level up · {selectedAnimal.level * 240}</button></div></section></div><div className="animal-browser"><button type="button" onClick={() => browseAnimal(-1)}>← Previous</button><span>{game.animals.findIndex((animal) => animal.id === selectedAnimal.id) + 1} of {game.animals.length}</span><button type="button" onClick={() => browseAnimal(1)}>Next →</button></div></section></div>}

    {result && <div className="modal-backdrop" role="presentation" onMouseDown={() => setResult(null)}><section className={`result-modal ${resultClass} ${result.kind === 'batch' ? 'batch-result-modal' : ''}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setResult(null)}>×</button>{result.kind === 'animal' ? <><p className="eyebrow">The bell answered</p><CreatureArt speciesId={result.animal.speciesId} variant={result.animal.variant} size="hero"/><span className="result-rank">{SPECIES[result.animal.speciesId].rank} · {VARIANTS[result.animal.variant].name}</span><h2>{animalName(result.animal)}</h2><p>Potential {result.animal.potential} · Level 1</p><StatGrid animal={result.animal}/><div className="result-actions"><button type="button" onClick={() => { setResult(null); openAnimalDetail(result.animal.id); }}>View animal</button><button type="button" onClick={() => setResult(null)}>Keep in storage</button></div></> : result.kind === 'batch' ? <><p className="eyebrow">Grand Summon complete</p><h2>Your ten new creatures</h2><p>{result.newSpecies.length ? `New discoveries: ${result.newSpecies.map((id) => SPECIES[id].name).join(', ')}` : 'All creatures were added to your collection.'}</p><div className="batch-result-grid">{result.animals.map((animal) => <article className={`rank-${SPECIES[animal.speciesId].rank.toLowerCase()} variant-${animal.variant}`} key={animal.id}><CreatureArt speciesId={animal.speciesId} variant={animal.variant} size="small"/><strong>{SPECIES[animal.speciesId].name}</strong><small>{VARIANTS[animal.variant].name} · P{animal.potential}</small></article>)}</div><div className="result-actions"><button type="button" onClick={() => { setResult(null); openView('animals'); }}>Open collection</button><button type="button" onClick={() => setResult(null)}>Close</button></div></> : <><p className="eyebrow">Border Forge reward</p><span className="result-emoji">{BORDERS[result.borderId].icon}</span><span className="result-rank">{BORDERS[result.borderId].rarity}</span><h2>{BORDERS[result.borderId].name}</h2><p>{result.duplicate ? 'Duplicate converted into 15 Fusion Dust.' : BORDERS[result.borderId].description}</p><div className="result-actions"><button type="button" disabled={result.duplicate} onClick={() => { equipBorder(result.borderId); setResult(null); }}>{result.duplicate ? 'Already owned' : 'Equip now'}</button><button type="button" onClick={() => setResult(null)}>Close</button></div></>}</section></div>}

    {actionFeedback && <div className={`action-feedback ${actionFeedback.tone}`} key={actionFeedback.key} role="status"><span>{actionFeedback.icon}</span><strong>{actionFeedback.text}</strong></div>}
    <footer><span>Core Game Alpha v0.5 · saved in this browser</span><button type="button" onClick={resetPrototype}>Reset alpha save</button></footer>
  </main>;
}
