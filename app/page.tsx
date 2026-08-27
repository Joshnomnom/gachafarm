'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FARM_SLOTS,
  SPECIES,
  SUMMON_COST,
  VARIANTS,
  animalIncomePerMinute,
  claimableIncome,
  createInitialGameState,
  farmIncomePerMinute,
  isGameState,
  mergeAnimals,
  summonAnimal,
  type AnimalInstance,
  type GameState,
} from '../src/domain/game';

type View = 'farm' | 'animals' | 'merge' | 'visit';

const STORAGE_KEY = 'gachafarm.prototype.v1';

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function animalName(animal: AnimalInstance) {
  return `${VARIANTS[animal.variant].name} ${SPECIES[animal.speciesId].name}`;
}

function statDifference(value: number, comparison?: number) {
  if (comparison === undefined) return '';
  const difference = value - comparison;
  return difference === 0 ? '±0' : difference > 0 ? `+${difference}` : `${difference}`;
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState(0));
  const [view, setView] = useState<View>('farm');
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState('Welcome to your first GachaFarm prototype.');
  const [summonResult, setSummonResult] = useState<AnimalInstance | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const currentTime = Date.now();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (isGameState(parsed)) setGame(parsed);
        else setGame(createInitialGameState(currentTime));
      } catch {
        setGame(createInitialGameState(currentTime));
      }
    } else {
      setGame(createInitialGameState(currentTime));
    }
    setNow(currentTime);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, hydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeAnimals = useMemo(
    () => Array.from({ length: FARM_SLOTS }, (_, slot) => game.animals.find((animal) => animal.activeSlot === slot) ?? null),
    [game.animals],
  );
  const incomeRate = farmIncomePerMinute(game.animals);
  const pendingIncome = now > 0 ? claimableIncome(game, now) : 0;
  const selectedAnimal = game.animals.find((animal) => animal.id === selectedId) ?? null;
  const comparisonAnimal = selectedAnimal
    ? game.animals
        .filter((animal) => animal.id !== selectedAnimal.id && animal.speciesId === selectedAnimal.speciesId)
        .sort((a, b) => animalIncomePerMinute(b) - animalIncomePerMinute(a))[0]
    : undefined;

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
    if (pendingIncome <= 0) {
      setMessage('Your animals are still gathering coins.');
      return;
    }
    setGame((current) => ({ ...current, coins: current.coins + pendingIncome, lastClaimedAt: now }));
    setMessage(`Collected ${pendingIncome.toLocaleString()} idle coins.`);
  }

  function performSummon() {
    if (game.coins < SUMMON_COST) {
      setMessage(`You need ${SUMMON_COST.toLocaleString()} coins to ring the bell.`);
      return;
    }
    const createdAt = Date.now();
    const result = summonAnimal(Math.random, newId('summon'), createdAt, game.pity);
    setGame((current) => ({
      ...current,
      coins: current.coins - SUMMON_COST,
      pity: result.nextPity,
      animals: [...current.animals, result.animal],
    }));
    setSummonResult(result.animal);
    setSelectedId(result.animal.id);
    setMessage(`${animalName(result.animal)} answered the bell.`);
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
      setGame((current) => ({
        ...current,
        animals: current.animals.map((animal) =>
          animal.id === animalId ? { ...animal, activeSlot: null } : animal,
        ),
      }));
      setMessage(`${animalName(target)} moved to storage.`);
      return;
    }
    const usedSlots = new Set(game.animals.map((animal) => animal.activeSlot).filter((slot) => slot !== null));
    const freeSlot = Array.from({ length: FARM_SLOTS }, (_, index) => index).find((slot) => !usedSlots.has(slot));
    if (freeSlot === undefined) {
      setMessage('All six habitats are occupied. Move an animal to storage first.');
      return;
    }
    setGame((current) => ({
      ...current,
      animals: current.animals.map((animal) =>
        animal.id === animalId ? { ...animal, activeSlot: freeSlot } : animal,
      ),
    }));
    setMessage(`${animalName(target)} is now producing on your farm.`);
  }

  function levelAnimal(animalId: string) {
    const animal = game.animals.find((candidate) => candidate.id === animalId);
    if (!animal) return;
    const cost = animal.level * 240;
    if (game.coins < cost) {
      setMessage(`You need ${cost.toLocaleString()} coins for the next level.`);
      return;
    }
    setGame((current) => ({
      ...current,
      coins: current.coins - cost,
      animals: current.animals.map((candidate) =>
        candidate.id === animalId ? { ...candidate, level: candidate.level + 1 } : candidate,
      ),
    }));
    setMessage(`${animalName(animal)} reached level ${animal.level + 1}.`);
  }

  function performMerge(group: AnimalInstance[]) {
    const parents = group.slice(0, 3);
    const result = mergeAnimals(parents, Math.random, newId('merge'), Date.now());
    const parentIds = new Set(parents.map((animal) => animal.id));
    setGame((current) => ({
      ...current,
      animals: [...current.animals.filter((animal) => !parentIds.has(animal.id)), result],
      fusionDust: current.fusionDust + 5,
    }));
    setSelectedId(result.id);
    setSummonResult(result);
    setMessage(`Merge complete: ${animalName(result)} with Potential ${result.potential}.`);
  }

  function resetPrototype() {
    const fresh = createInitialGameState(Date.now());
    setGame(fresh);
    setView('farm');
    setSelectedId(null);
    setSummonResult(null);
    setMessage('Prototype reset. Your starter animals are ready.');
  }

  function showSummon() {
    setView('farm');
    window.setTimeout(() => document.getElementById('summon-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={() => setView('farm')} aria-label="Open GachaFarm">
          <span className="brand-mark">GF</span>
          <span><strong>GachaFarm</strong><small>Raise the impossible</small></span>
        </button>
        <div className="resources" aria-label="Farm resources">
          <span className="resource-pill coin-pill"><b>●</b> {game.coins.toLocaleString()}</span>
          <span className="resource-pill" title="Discovery Stars"><b>✦</b> {game.discoveryStars}</span>
          <span className="resource-pill" title="Fusion Dust"><b>◇</b> {game.fusionDust}</span>
          <button className="profile-button" type="button" aria-label="Open player profile">LV. 3</button>
        </div>
      </header>

      <section className="hero-strip">
        <div>
          <p className="eyebrow">Meadow League · Local prototype</p>
          <h1>{view === 'farm' ? 'Make room for something legendary.' : view === 'animals' ? 'Every copy has a story.' : view === 'merge' ? 'Three become something better.' : 'A wider world is coming.'}</h1>
        </div>
        <button className="claim-button" type="button" onClick={claimIncome}>
          <span>{pendingIncome > 0 ? 'Idle income ready' : 'Animals are producing'}</span>
          <strong>{pendingIncome > 0 ? `Claim ${pendingIncome.toLocaleString()} coins` : `${incomeRate} coins/min`}</strong>
        </button>
      </section>

      <div className="game-layout">
        <nav className="side-nav" aria-label="Game navigation">
          <button className={view === 'farm' ? 'active' : ''} type="button" onClick={() => setView('farm')}><span>⌂</span> Farm</button>
          <button type="button" onClick={showSummon}><span>✦</span> Summon</button>
          <button className={view === 'animals' ? 'active' : ''} type="button" onClick={() => setView('animals')}><span>▦</span> Animals</button>
          <button className={view === 'merge' ? 'active' : ''} type="button" onClick={() => setView('merge')}><span>⌁</span> Merge</button>
          <button className={view === 'visit' ? 'active' : ''} type="button" onClick={() => setView('visit')}><span>♧</span> Visit</button>
        </nav>

        {view === 'farm' && (
          <section className="farm-card" id="farm" aria-labelledby="farm-title">
            <div className="farm-heading">
              <div><p className="eyebrow">Active habitat · {game.animals.filter((animal) => animal.activeSlot !== null).length}/{FARM_SLOTS}</p><h2 id="farm-title">Sunnybrook Farm</h2></div>
              <div className="income-rate"><span>Farm income</span><strong>{incomeRate} coins/min</strong></div>
            </div>
            <div className="farm-field">
              <div className="sun" aria-hidden="true" />
              <div className="cloud cloud-one" aria-hidden="true" />
              <div className="cloud cloud-two" aria-hidden="true" />
              <div className="barn" aria-hidden="true"><span className="barn-roof" /><span className="barn-body"><i /></span></div>
              <div className="animal-grid">
                {activeAnimals.map((animal, index) => (
                  <article className={animal ? 'animal-slot occupied' : 'animal-slot'} key={index}>
                    {animal ? (
                      <>
                        <span className={`variant-tag ${animal.variant}`}>{VARIANTS[animal.variant].name}</span>
                        {animal.locked && <span className="lock-corner" aria-label="Locked">◆</span>}
                        <button className="animal-focus" type="button" onClick={() => { setSelectedId(animal.id); setView('animals'); }}>
                          <span className="animal-emoji" role="img" aria-label={SPECIES[animal.speciesId].name}>{SPECIES[animal.speciesId].emoji}</span>
                          <strong>{SPECIES[animal.speciesId].name}</strong>
                          <small>+{animalIncomePerMinute(animal)}/min · P{animal.potential}</small>
                        </button>
                      </>
                    ) : <><span className="empty-plus">+</span><strong>Empty habitat</strong><small>Place an animal</small></>}
                  </article>
                ))}
              </div>
            </div>
            <p className="status-message" role="status" aria-live="polite">{message}</p>
          </section>
        )}

        {view === 'animals' && (
          <section className="farm-card manage-card" aria-labelledby="collection-title">
            <div className="section-heading">
              <div><p className="eyebrow">Collection storage</p><h2 id="collection-title">Your animals</h2></div>
              <span className="count-badge">{game.animals.length} owned</span>
            </div>
            {selectedAnimal && (
              <div className="comparison-panel">
                <div className="comparison-title">
                  <span className="comparison-emoji">{SPECIES[selectedAnimal.speciesId].emoji}</span>
                  <div><small>Selected</small><strong>{animalName(selectedAnimal)}</strong><span>Level {selectedAnimal.level} · P{selectedAnimal.potential}</span></div>
                </div>
                <div className="stat-comparison">
                  {(['yieldStat', 'tempoStat', 'fortune', 'heritage'] as const).map((stat) => (
                    <div key={stat}><span>{stat === 'yieldStat' ? 'Yield' : stat === 'tempoStat' ? 'Tempo' : stat[0].toUpperCase() + stat.slice(1)}</span><strong>{selectedAnimal[stat]}</strong><em>{statDifference(selectedAnimal[stat], comparisonAnimal?.[stat])}</em></div>
                  ))}
                </div>
                <div className="comparison-actions">
                  <button type="button" onClick={() => toggleLock(selectedAnimal.id)}>{selectedAnimal.locked ? 'Unlock' : 'Lock'}</button>
                  <button type="button" onClick={() => togglePlacement(selectedAnimal.id)}>{selectedAnimal.activeSlot === null ? 'Place' : 'Store'}</button>
                  <button className="primary-small" type="button" onClick={() => levelAnimal(selectedAnimal.id)}>Level up · {selectedAnimal.level * 240}</button>
                </div>
                {comparisonAnimal && <p className="comparison-note">Numbers compare against your strongest other {SPECIES[selectedAnimal.speciesId].name}.</p>}
              </div>
            )}
            <div className="collection-grid">
              {[...game.animals].sort((a, b) => Number(b.activeSlot !== null) - Number(a.activeSlot !== null) || b.potential - a.potential).map((animal) => (
                <button className={`collection-card ${selectedId === animal.id ? 'selected' : ''}`} type="button" key={animal.id} onClick={() => setSelectedId(animal.id)}>
                  <span className={`rank-ribbon ${SPECIES[animal.speciesId].rank.toLowerCase()}`}>{SPECIES[animal.speciesId].rank}</span>
                  <span className="collection-emoji">{SPECIES[animal.speciesId].emoji}</span>
                  <strong>{SPECIES[animal.speciesId].name}</strong>
                  <span className="collection-variant">{VARIANTS[animal.variant].name} · P{animal.potential}</span>
                  <small>{animal.activeSlot !== null ? `Active slot ${animal.activeSlot + 1}` : 'In storage'} {animal.locked ? '· Locked' : ''}</small>
                </button>
              ))}
            </div>
            <p className="status-message" role="status" aria-live="polite">{message}</p>
          </section>
        )}

        {view === 'merge' && (
          <section className="farm-card manage-card" aria-labelledby="merge-title">
            <div className="section-heading"><div><p className="eyebrow">Safe Species Merge</p><h2 id="merge-title">Turn duplicates into potential</h2></div><span className="count-badge">35% variant upgrade</span></div>
            <div className="merge-explainer"><span>3 same species</span><b>＋</b><span>same variant</span><b>→</b><span>1 stronger animal</span></div>
            {mergeGroups.length > 0 ? (
              <div className="merge-list">
                {mergeGroups.map((group) => {
                  const preview = group.slice(0, 3);
                  return (
                    <article className="merge-option" key={`${group[0].speciesId}-${group[0].variant}`}>
                      <div className="merge-animals">
                        {preview.map((animal) => <span key={animal.id} title={`Potential ${animal.potential}`}>{SPECIES[animal.speciesId].emoji}<small>P{animal.potential}</small></span>)}
                        <b>→</b><span className="mystery-result">?</span>
                      </div>
                      <div><strong>{VARIANTS[group[0].variant].name} {SPECIES[group[0].speciesId].name}</strong><p>Best parent stat is protected. Result cannot drop below {VARIANTS[group[0].variant].name}.</p></div>
                      <button className="merge-button" type="button" onClick={() => performMerge(group)}>Merge safely</button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state"><span>⌁</span><h3>No safe merge ready</h3><p>You need three unlocked, inactive animals of the same species and variant.</p><button type="button" onClick={showSummon}>Summon more animals</button></div>
            )}
            <p className="status-message" role="status" aria-live="polite">{message}</p>
          </section>
        )}

        {view === 'visit' && (
          <section className="farm-card manage-card" aria-labelledby="visit-title">
            <div className="section-heading"><div><p className="eyebrow">Social farm visits</p><h2 id="visit-title">The road opens next</h2></div><span className="count-badge muted-badge">Backend phase</span></div>
            <div className="visit-preview">
              <div className="visit-landscape"><span>🐼</span><span>🦄</span><span>🐮</span><span>🐉</span></div>
              <div><h3>Visit farms without risking your animals</h3><p>The multiplayer layer will use read-only public farm snapshots. Visitors can admire showcase animals and leave preset reactions, but cannot collect income or change placements.</p><ul><li>Find friends by farm code</li><li>Public, code-only, or private visibility</li><li>Preset reactions with daily limits</li></ul></div>
            </div>
            <p className="status-message">This screen is intentionally a preview until authoritative accounts and database rules are connected.</p>
          </section>
        )}

        <aside className="summon-panel" id="summon-panel" aria-labelledby="summon-title">
          <div className="bell-orbit" aria-hidden="true"><span className="spark spark-a">✦</span><span className="spark spark-b">✧</span><span className="summon-bell">🔔</span></div>
          <p className="eyebrow">Prototype Bell</p>
          <h2 id="summon-title">Who will answer?</h2>
          <p>Chicken 55% · Cow 40% · Dragon 5%. Golden variant 12%. Accelerated rates are for prototype testing.</p>
          <div className="odds-row"><span>Dragon guarantee</span><strong>{20 - game.pity} pulls</strong></div>
          <div className="pity-track"><span style={{ width: `${(game.pity / 20) * 100}%` }} /></div>
          <button className="summon-button" type="button" onClick={performSummon}><span>Ring once</span><strong>● {SUMMON_COST}</strong></button>
          <button className="rates-button" type="button" onClick={() => setMessage('Full production rates will use the approved six-rank table.')} >Prototype rate note</button>
          <hr />
          <button className="reset-button" type="button" onClick={resetPrototype}>Reset local prototype</button>
        </aside>
      </div>

      {summonResult && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSummonResult(null)}>
          <section className={`result-modal ${summonResult.variant}`} role="dialog" aria-modal="true" aria-labelledby="result-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setSummonResult(null)} aria-label="Close result">×</button>
            <p className="eyebrow">New animal</p>
            <span className="result-emoji">{SPECIES[summonResult.speciesId].emoji}</span>
            <span className="result-rank">{SPECIES[summonResult.speciesId].rank}</span>
            <h2 id="result-title">{animalName(summonResult)}</h2>
            <p>Potential {summonResult.potential} · {animalIncomePerMinute(summonResult)} coins/min at level 1</p>
            <div className="result-stats"><span>Yield <b>{summonResult.yieldStat}</b></span><span>Tempo <b>{summonResult.tempoStat}</b></span><span>Fortune <b>{summonResult.fortune}</b></span><span>Heritage <b>{summonResult.heritage}</b></span></div>
            <div className="result-actions"><button type="button" onClick={() => { togglePlacement(summonResult.id); setSummonResult(null); }}>Place on farm</button><button type="button" onClick={() => { setView('animals'); setSummonResult(null); }}>View collection</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
