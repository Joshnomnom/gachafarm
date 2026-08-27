'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BORDERS, BORDER_SUMMON_COST, FARM_SLOTS, SPECIES, SUMMON_COST, VARIANTS,
  animalIncomePerMinute, claimableIncome, createInitialGameState, farmIncomePerMinute,
  mergeAnimals, migrateGameState, summonAnimal, summonBorder,
  type AnimalInstance, type BorderId, type GameState,
} from '../src/domain/game';

type View = 'farm' | 'summon' | 'animals' | 'merge' | 'visit';
type Banner = 'creature' | 'border';
type Result = { kind: 'animal'; animal: AnimalInstance } | { kind: 'border'; borderId: BorderId; duplicate: boolean };

const STORAGE_KEY = 'gachafarm.prototype.v1';
const statLabels = { yieldStat: 'Yield', tempoStat: 'Tempo', fortune: 'Fortune', heritage: 'Heritage' } as const;

function newId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function animalName(animal: AnimalInstance) { return `${VARIANTS[animal.variant].name} ${SPECIES[animal.speciesId].name}`; }
function statDifference(value: number, comparison?: number) {
  if (comparison === undefined) return '';
  const difference = value - comparison;
  return difference === 0 ? '±0' : difference > 0 ? `+${difference}` : `${difference}`;
}

function StatGrid({ animal, comparison }: { animal: AnimalInstance; comparison?: AnimalInstance }) {
  return <div className="stat-grid">
    {(Object.keys(statLabels) as (keyof typeof statLabels)[]).map((stat) => <div key={stat}>
      <span>{statLabels[stat]}</span><strong>{animal[stat]}</strong>
      {comparison && <em>{statDifference(animal[stat], comparison[stat])}</em>}
    </div>)}
  </div>;
}

function AnimalCard({ animal, selected, onSelect }: { animal: AnimalInstance; selected: boolean; onSelect: () => void }) {
  const species = SPECIES[animal.speciesId];
  return <article className={`animal-info-card ${selected ? 'selected' : ''}`}>
    <div className="card-badges">
      <span className={`rank-badge ${species.rank.toLowerCase()}`}>{species.rank}</span>
      <span className={`variant-badge ${animal.variant}`}>{VARIANTS[animal.variant].name}</span>
      {animal.locked && <span className="state-badge">Locked</span>}
    </div>
    <div className="animal-identity">
      <span className="collection-emoji" role="img" aria-label={species.name}>{species.emoji}</span>
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
  const [farmAnimalId, setFarmAnimalId] = useState<string | null>(null);
  const [slotPicker, setSlotPicker] = useState<number | null>(null);
  const [movingAnimalId, setMovingAnimalId] = useState<string | null>(null);
  const [isSummoning, setIsSummoning] = useState(false);

  useEffect(() => {
    const currentTime = Date.now();
    const saved = localStorage.getItem(STORAGE_KEY);
    let next = createInitialGameState(currentTime);
    if (saved) {
      try { next = migrateGameState(JSON.parse(saved) as unknown, currentTime) ?? next; } catch { /* use fresh state */ }
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setGame(next); setNow(currentTime); setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(game)); }, [game, hydrated]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  const activeAnimals = useMemo(() => Array.from({ length: FARM_SLOTS }, (_, slot) => game.animals.find((animal) => animal.activeSlot === slot) ?? null), [game.animals]);
  const storageAnimals = game.animals.filter((animal) => animal.activeSlot === null);
  const activeBorder = BORDERS[game.activeBorder];
  const incomeRate = farmIncomePerMinute(game.animals, activeBorder.incomeMultiplier);
  const pendingIncome = now > 0 ? claimableIncome(game, now) : 0;
  const selectedAnimal = game.animals.find((animal) => animal.id === selectedId) ?? null;
  const farmAnimal = game.animals.find((animal) => animal.id === farmAnimalId) ?? null;
  const comparisonAnimal = selectedAnimal ? game.animals.filter((animal) => animal.id !== selectedAnimal.id && animal.speciesId === selectedAnimal.speciesId).sort((a, b) => animalIncomePerMinute(b) - animalIncomePerMinute(a))[0] : undefined;
  const mergeGroups = useMemo(() => {
    const groups = new Map<string, AnimalInstance[]>();
    for (const animal of game.animals) {
      if (animal.locked || animal.activeSlot !== null) continue;
      const key = `${animal.speciesId}:${animal.variant}`;
      groups.set(key, [...(groups.get(key) ?? []), animal]);
    }
    return [...groups.values()].filter((group) => group.length >= 3);
  }, [game.animals]);

  function claimIncome() {
    if (pendingIncome <= 0) { setMessage('Your animals are still gathering coins.'); return; }
    setGame((current) => ({ ...current, coins: current.coins + pendingIncome, lastClaimedAt: now }));
    setMessage(`Collected ${pendingIncome.toLocaleString()} idle coins.`);
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
    setFarmAnimalId(null); setMovingAnimalId(null);
  }

  function beginMove(animalId: string) {
    setFarmAnimalId(null); setMovingAnimalId(animalId);
    setMessage('Move mode: click any habitat to move or swap this animal.');
  }

  function performSummon() {
    const cost = banner === 'creature' ? SUMMON_COST : BORDER_SUMMON_COST;
    if (game.coins < cost || isSummoning) { setMessage(`You need ${cost.toLocaleString()} coins for this summon.`); return; }
    setIsSummoning(true); setMessage('The bell is answering…');
    window.setTimeout(() => {
      if (banner === 'creature') {
        setGame((current) => {
          const border = BORDERS[current.activeBorder];
          const pulled = summonAnimal(Math.random, newId('summon'), Date.now(), current.pity, { dragonBonus: border.dragonBonus, goldenBonus: border.goldenBonus });
          setResult({ kind: 'animal', animal: pulled.animal }); setSelectedId(pulled.animal.id);
          setMessage(`${animalName(pulled.animal)} answered the bell.`);
          return { ...current, coins: current.coins - SUMMON_COST, pity: pulled.nextPity, animals: [...current.animals, pulled.animal] };
        });
      } else {
        setGame((current) => {
          const pulled = summonBorder(Math.random, current.borderPity);
          const duplicate = current.ownedBorders.includes(pulled.borderId);
          setResult({ kind: 'border', borderId: pulled.borderId, duplicate });
          setMessage(duplicate ? `Duplicate ${BORDERS[pulled.borderId].name} became 15 Fusion Dust.` : `${BORDERS[pulled.borderId].name} joined your border collection.`);
          return { ...current, coins: current.coins - BORDER_SUMMON_COST, borderPity: pulled.nextPity,
            fusionDust: current.fusionDust + (duplicate ? 15 : 0),
            ownedBorders: duplicate ? current.ownedBorders : [...current.ownedBorders, pulled.borderId] };
        });
      }
      setIsSummoning(false);
    }, 700);
  }

  function toggleLock(animalId: string) {
    setGame((current) => ({ ...current, animals: current.animals.map((animal) => animal.id === animalId ? { ...animal, locked: !animal.locked } : animal) }));
  }

  function togglePlacement(animalId: string) {
    const target = game.animals.find((animal) => animal.id === animalId);
    if (!target) return;
    if (target.activeSlot !== null) { storeAnimal(animalId); return; }
    const used = new Set(game.animals.map((animal) => animal.activeSlot).filter((slot) => slot !== null));
    const free = Array.from({ length: FARM_SLOTS }, (_, index) => index).find((slot) => !used.has(slot));
    if (free === undefined) { setMessage('All habitats are occupied. Use the Farm screen to choose an animal to swap.'); setView('farm'); return; }
    placeAnimalInSlot(animalId, free);
  }

  function levelAnimal(animalId: string) {
    const animal = game.animals.find((candidate) => candidate.id === animalId);
    if (!animal) return;
    const cost = animal.level * 240;
    if (game.coins < cost) { setMessage(`You need ${cost.toLocaleString()} coins for the next level.`); return; }
    setGame((current) => ({ ...current, coins: current.coins - cost, animals: current.animals.map((candidate) => candidate.id === animalId ? { ...candidate, level: candidate.level + 1 } : candidate) }));
    setMessage(`${animalName(animal)} reached level ${animal.level + 1}.`);
  }

  function performMerge(group: AnimalInstance[]) {
    const parents = group.slice(0, 3);
    const merged = mergeAnimals(parents, Math.random, newId('merge'), now);
    const ids = new Set(parents.map((animal) => animal.id));
    setGame((current) => ({ ...current, animals: [...current.animals.filter((animal) => !ids.has(animal.id)), merged], fusionDust: current.fusionDust + 5 }));
    setSelectedId(merged.id); setResult({ kind: 'animal', animal: merged }); setMessage(`Merge complete: ${animalName(merged)} with Potential ${merged.potential}.`);
  }

  function equipBorder(borderId: BorderId) {
    setGame((current) => ({ ...current, activeBorder: borderId }));
    setMessage(`${BORDERS[borderId].name} is now active on your farm.`);
  }

  function resetPrototype() {
    setGame(createInitialGameState(Date.now())); setView('farm'); setSelectedId(null); setResult(null);
    setMessage('Prototype reset. Your starter animals are ready.');
  }

  const heroTitle = view === 'farm' ? 'Your farm should feel alive.' : view === 'summon' ? 'Ring for the extraordinary.' : view === 'animals' ? 'Every copy has a story.' : view === 'merge' ? 'Three become something better.' : 'A wider world is coming.';

  return <main className="game-shell">
    <header className="topbar">
      <button className="brand brand-button" type="button" onClick={() => setView('farm')} aria-label="Open GachaFarm"><span className="brand-mark">GF</span><span><strong>GachaFarm</strong><small>Raise the impossible</small></span></button>
      <div className="resources" aria-label="Farm resources"><span className="resource-pill coin-pill"><b>●</b> {game.coins.toLocaleString()}</span><span className="resource-pill" title="Discovery Stars"><b>✦</b> {game.discoveryStars}</span><span className="resource-pill" title="Fusion Dust"><b>◇</b> {game.fusionDust}</span><button className="profile-button" type="button">LV. 3</button></div>
    </header>

    <section className="hero-strip"><div><p className="eyebrow">Meadow League · Local prototype</p><h1>{heroTitle}</h1></div><button className="claim-button" type="button" onClick={claimIncome}><span>{pendingIncome > 0 ? 'Idle income ready' : 'Animals are producing'}</span><strong>{pendingIncome > 0 ? `Claim ${pendingIncome.toLocaleString()} coins` : `${incomeRate} coins/min`}</strong></button></section>

    <div className="game-layout">
      <nav className="side-nav" aria-label="Game navigation">
        {([['farm','⌂','Farm'],['summon','✦','Summon'],['animals','▦','Animals'],['merge','⌁','Merge'],['visit','♧','Visit']] as [View,string,string][]).map(([id, icon, label]) => <button key={id} className={view === id ? 'active' : ''} type="button" onClick={() => setView(id)}><span>{icon}</span>{label}</button>)}
      </nav>

      {view === 'farm' && <section className="farm-card wide-card" aria-labelledby="farm-title">
        <div className="farm-heading"><div><p className="eyebrow">Active habitat · {game.animals.filter((animal) => animal.activeSlot !== null).length}/{FARM_SLOTS}</p><h2 id="farm-title">Sunnybrook Farm</h2><small className="border-label">{activeBorder.icon} {activeBorder.name} · {activeBorder.description}</small></div><div className="income-rate"><span>Farm income</span><strong>{incomeRate} coins/min</strong></div></div>
        {movingAnimalId && <div className="move-mode"><span>↔ Click a habitat to move or swap {animalName(game.animals.find((animal) => animal.id === movingAnimalId)!)}.</span><button type="button" onClick={() => setMovingAnimalId(null)}>Cancel</button></div>}
        <div className="farm-field"><div className="sun" aria-hidden="true"/><div className="cloud cloud-one" aria-hidden="true"/><div className="cloud cloud-two" aria-hidden="true"/><div className="barn" aria-hidden="true"><span className="barn-roof"/><span className="barn-body"><i/></span></div>
          <div className="animal-grid">{activeAnimals.map((animal, index) => <button className={`animal-slot ${animal ? 'occupied' : ''} ${movingAnimalId ? 'move-target' : ''}`} type="button" key={index} onClick={() => handleFarmSlot(index, animal)}>
            {animal ? <><span className={`variant-tag ${animal.variant}`}>{VARIANTS[animal.variant].name}</span>{animal.locked && <span className="lock-corner">◆</span>}<span className="animal-stage"><span className="animal-shadow"/><span className="animal-emoji active-animal" style={{ animationDelay: `${-index * .37}s` }} role="img" aria-label={SPECIES[animal.speciesId].name}>{SPECIES[animal.speciesId].emoji}</span></span><strong>{SPECIES[animal.speciesId].name}</strong><small>+{animalIncomePerMinute(animal)}/min · P{animal.potential}</small></> : <><span className="empty-plus">+</span><strong>Empty habitat</strong><small>Click to place an animal</small></>}
          </button>)}</div>
        </div><p className="status-message" role="status" aria-live="polite">{message}</p>
      </section>}

      {view === 'summon' && <section className={`summon-screen wide-card ${isSummoning ? 'summoning' : ''}`} aria-labelledby="summon-title">
        <div className="summon-sky"><span className="summon-star star-one">✦</span><span className="summon-star star-two">✧</span><span className="summon-star star-three">✦</span><div className="magic-rings"><span/><span/><div className="great-bell">{banner === 'creature' ? '🔔' : '🪄'}</div></div></div>
        <div className="summon-content"><p className="eyebrow">The Grand Gacha Hall</p><h2 id="summon-title">Choose what answers the bell</h2><p>Creature banners grow your herd. Border banners unlock permanent farm styles and gameplay boosts.</p>
          <div className="banner-tabs"><button className={banner === 'creature' ? 'active' : ''} type="button" onClick={() => setBanner('creature')}><span>🐉</span><b>Creature Bell</b><small>Animals with unique stats</small></button><button className={banner === 'border' ? 'active' : ''} type="button" onClick={() => setBanner('border')}><span>🌠</span><b>Border Forge</b><small>Farm looks + passive boosts</small></button></div>
          <div className="banner-details">
            {banner === 'creature' ? <><div><span>Featured reward</span><strong>Celestial Dragon · 5%</strong><small>Golden variant · 12%{activeBorder.goldenBonus ? ` + ${activeBorder.goldenBonus * 100}% boost` : ''}</small></div><div><span>Active border</span><strong>{activeBorder.icon} {activeBorder.name}</strong><small>{activeBorder.description}</small></div><div><span>Mythic guarantee</span><strong>{game.pity + 1}/20 pulls</strong><small>Guaranteed Dragon on pull 20</small></div></> : <><div><span>Featured reward</span><strong>🌠 Starfall Fence · 5%</strong><small>Boosts Dragon rate by +2%</small></div><div><span>Duplicate reward</span><strong>◇ 15 Fusion Dust</strong><small>No pull is completely wasted</small></div><div><span>Legendary guarantee</span><strong>{game.borderPity + 1}/15 pulls</strong><small>Guaranteed Starfall on pull 15</small></div></>}
          </div>
          <button className="summon-main-button" type="button" disabled={isSummoning} onClick={performSummon}><span>{isSummoning ? 'The magic is gathering…' : banner === 'creature' ? 'Ring the Creature Bell' : 'Forge a Farm Border'}</span><strong>● {(banner === 'creature' ? SUMMON_COST : BORDER_SUMMON_COST).toLocaleString()}</strong></button>
          <p className="rate-note">Rates shown are exact for this prototype. Summons are purchased only with earned game coins.</p>
          <div className="border-collection"><div className="section-heading compact"><div><p className="eyebrow">Owned styles</p><h3>Your farm borders</h3></div><span className="count-badge">{game.ownedBorders.length}/{Object.keys(BORDERS).length}</span></div><div className="border-grid">{game.ownedBorders.map((id) => <article className={game.activeBorder === id ? 'active' : ''} key={id}><span>{BORDERS[id].icon}</span><div><strong>{BORDERS[id].name}</strong><small>{BORDERS[id].description}</small></div><button type="button" disabled={game.activeBorder === id} onClick={() => equipBorder(id)}>{game.activeBorder === id ? 'Equipped' : 'Equip'}</button></article>)}</div></div>
        </div><p className="status-message" role="status">{message}</p>
      </section>}

      {view === 'animals' && <section className="farm-card manage-card wide-card" aria-labelledby="collection-title">
        <div className="section-heading"><div><p className="eyebrow">Collection storage</p><h2 id="collection-title">Your animals</h2></div><span className="count-badge">{game.animals.length} owned</span></div>
        {selectedAnimal && <div className="detail-panel"><div className="detail-identity"><span>{SPECIES[selectedAnimal.speciesId].emoji}</span><div><small>Selected animal</small><h3>{animalName(selectedAnimal)}</h3><p>{SPECIES[selectedAnimal.speciesId].rank} · Level {selectedAnimal.level} · Potential {selectedAnimal.potential}</p></div></div><section><h4>Production</h4><strong className="big-production">+{animalIncomePerMinute(selectedAnimal)} coins/min</strong></section><section><h4>Genetics</h4><StatGrid animal={selectedAnimal} comparison={comparisonAnimal}/><small>Green numbers compare with your strongest matching species.</small></section><section><h4>Farm status</h4><p>{selectedAnimal.activeSlot === null ? 'Safely stored. Ready to place or merge.' : `Working in habitat ${selectedAnimal.activeSlot + 1}.`}</p><div className="detail-actions"><button type="button" onClick={() => toggleLock(selectedAnimal.id)}>{selectedAnimal.locked ? 'Unlock' : 'Lock'}</button><button type="button" onClick={() => togglePlacement(selectedAnimal.id)}>{selectedAnimal.activeSlot === null ? 'Place on farm' : 'Move to storage'}</button><button className="primary-small" type="button" onClick={() => levelAnimal(selectedAnimal.id)}>Level up · {selectedAnimal.level * 240}</button></div></section></div>}
        <div className="collection-grid">{game.animals.map((animal) => <AnimalCard key={animal.id} animal={animal} selected={selectedId === animal.id} onSelect={() => setSelectedId(animal.id)}/>)}</div><p className="status-message" role="status">{message}</p>
      </section>}

      {view === 'merge' && <section className="farm-card manage-card wide-card"><div className="section-heading"><div><p className="eyebrow">Safe species merge</p><h2>Merge lab</h2></div><span className="count-badge">◇ {game.fusionDust}</span></div><div className="merge-explainer"><span>Same species</span><b>+</b><span>Same variant</span><b>+</b><span>3 in storage</span><b>→</b><span>Stronger offspring</span></div>{mergeGroups.length ? <div className="merge-list">{mergeGroups.map((group) => <article className="merge-option" key={`${group[0].speciesId}:${group[0].variant}`}><div><strong>{animalName(group[0])}</strong><p>Uses the first three eligible animals. Natural animals have a 35% Golden upgrade chance.</p></div><div className="merge-animals">{group.slice(0,3).map((animal) => <span key={animal.id}>{SPECIES[animal.speciesId].emoji}<small>P{animal.potential}</small></span>)}<b>→</b><span className="mystery-result">?</span></div><button className="merge-button" type="button" onClick={() => performMerge(group)}>Merge 3</button></article>)}</div> : <div className="empty-state"><span>⌁</span><h3>No merge group ready</h3><p>You need three unlocked, inactive animals with the same species and variant.</p><button type="button" onClick={() => setView('summon')}>Open Summon Hall</button></div>}<p className="status-message">{message}</p></section>}

      {view === 'visit' && <section className="farm-card manage-card wide-card"><div className="section-heading"><div><p className="eyebrow">Multiplayer preview</p><h2>Visit another farm</h2></div><span className="count-badge muted-badge">Database next</span></div><div className="visit-preview"><div className="visit-landscape"><span>🐮</span><span>🐉</span></div><div><h3>Cloud save will unlock visiting</h3><p>The playable loop is browser-local today. Supabase is the planned free-tier backend for accounts, saved farms, profiles, and read-only visits.</p><ul><li>See a friend&apos;s active animals and equipped border.</li><li>Compare income and collection discoveries.</li><li>Leave a lightweight guest-book reaction later.</li></ul></div></div><p className="status-message">No crop farming—animals, collecting, merging, decorating, and social discovery stay at the center.</p></section>}
    </div>

    {slotPicker !== null && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSlotPicker(null)}><section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setSlotPicker(null)}>×</button><p className="eyebrow">Habitat {slotPicker + 1}</p><h2 id="picker-title">Choose an animal to place</h2><p className="modal-intro">Pick directly from storage. You can move it again by clicking its farm habitat.</p>{storageAnimals.length ? <div className="picker-list">{storageAnimals.map((animal) => <button type="button" key={animal.id} onClick={() => placeAnimalInSlot(animal.id, slotPicker)}><span>{SPECIES[animal.speciesId].emoji}</span><div><strong>{animalName(animal)}</strong><small>Level {animal.level} · P{animal.potential}</small></div><b>+{animalIncomePerMinute(animal)}/min</b></button>)}</div> : <div className="empty-state"><span>▦</span><h3>Storage is empty</h3><p>Summon another creature or move an active animal.</p></div>}</section></div>}

    {farmAnimal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setFarmAnimalId(null)}><section className="picker-modal animal-modal" role="dialog" aria-modal="true" aria-labelledby="farm-animal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setFarmAnimalId(null)}>×</button><div className="detail-identity"><span>{SPECIES[farmAnimal.speciesId].emoji}</span><div><small>Habitat {(farmAnimal.activeSlot ?? 0) + 1}</small><h2 id="farm-animal-title">{animalName(farmAnimal)}</h2><p>{SPECIES[farmAnimal.speciesId].rank} · Level {farmAnimal.level} · Potential {farmAnimal.potential}</p></div></div><div className="production-strip"><span>Production</span><strong>+{animalIncomePerMinute(farmAnimal)} coins/min</strong></div><h4>Genetic stats</h4><StatGrid animal={farmAnimal}/><div className="modal-action-row"><button type="button" onClick={() => storeAnimal(farmAnimal.id)}>Move to storage</button><button className="primary-small" type="button" onClick={() => beginMove(farmAnimal.id)}>Move or swap</button><button type="button" onClick={() => { setSelectedId(farmAnimal.id); setFarmAnimalId(null); setView('animals'); }}>Full details</button></div></section></div>}

    {result && <div className="modal-backdrop" role="presentation" onMouseDown={() => setResult(null)}><section className={`result-modal ${result.kind === 'animal' ? result.animal.variant : BORDERS[result.borderId].rarity.toLowerCase()}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setResult(null)}>×</button>{result.kind === 'animal' ? <><p className="eyebrow">The bell answered</p><span className="result-emoji">{SPECIES[result.animal.speciesId].emoji}</span><span className="result-rank">{SPECIES[result.animal.speciesId].rank} · {VARIANTS[result.animal.variant].name}</span><h2>{animalName(result.animal)}</h2><p>Potential {result.animal.potential} · Level 1</p><StatGrid animal={result.animal}/><div className="result-actions"><button type="button" onClick={() => { setResult(null); setView('animals'); }}>View animal</button><button type="button" onClick={() => setResult(null)}>Keep in storage</button></div></> : <><p className="eyebrow">Border Forge reward</p><span className="result-emoji">{BORDERS[result.borderId].icon}</span><span className="result-rank">{BORDERS[result.borderId].rarity}</span><h2>{BORDERS[result.borderId].name}</h2><p>{result.duplicate ? 'Duplicate converted into 15 Fusion Dust.' : BORDERS[result.borderId].description}</p><div className="result-actions"><button type="button" disabled={result.duplicate} onClick={() => { equipBorder(result.borderId); setResult(null); }}>{result.duplicate ? 'Already owned' : 'Equip now'}</button><button type="button" onClick={() => setResult(null)}>Close</button></div></>}</section></div>}

    <footer><span>Prototype v0.2 · saved in this browser</span><button type="button" onClick={resetPrototype}>Reset prototype</button></footer>
  </main>;
}
