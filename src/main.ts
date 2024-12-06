import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";

const INITIAL_LAT = 36.9895;
const INITIAL_LNG = -122.0627;
const GRID_SIZE = 0.0001;
const CACHE_PROBABILITY = 0.1;
const RANGE = 8;

type Coordinates = { lat: number; lng: number };
type Cell = { i: number; j: number };
type Coin = { id: string };

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Geocache implements Momento<string> {
  id: string;
  location: Coordinates;
  coins: Coin[];

  constructor(id: string, location: Coordinates, coins: Coin[] = []) {
    this.id = id;
    this.location = location;
    this.coins = coins;
  }

  toMomento(): string {
    return JSON.stringify({
      id: this.id,
      location: this.location,
      coins: this.coins,
    });
  }

  fromMomento(momento: string): void {
    const state = JSON.parse(momento);
    this.id = state.id;
    this.location = state.location;
    this.coins = state.coins;
  }
}

// Flyweight cache for cell conversions
const cellCache = new Map<string, Cell>();

function latLngToCell({ lat, lng }: Coordinates): Cell {
  const i = Math.floor(lat / GRID_SIZE);
  const j = Math.floor(lng / GRID_SIZE);
  const cacheKey = `${i}:${j}`;
  if (!cellCache.has(cacheKey)) {
    cellCache.set(cacheKey, { i, j });
  }
  return cellCache.get(cacheKey)!;
}

class Player {
  position: Coordinates;
  coins: Coin[];
  visitedCaches: Set<string>;

  move(direction: string) {
    switch (direction) {
      case "north":
        this.position.lat += GRID_SIZE;
        break;
      case "south":
        this.position.lat -= GRID_SIZE;
        break;
      case "east":
        this.position.lng += GRID_SIZE;
        break;
      case "west":
        this.position.lng -= GRID_SIZE;
        break;
    }
  }

  constructor(position: Coordinates) {
    this.position = position;
    this.coins = [];
    this.visitedCaches = new Set();
  }

  collectCoin(coin: Coin, cacheId: string) {
    this.coins.push(coin);
    this.visitedCaches.add(cacheId);
  }

  depositCoin(cache: Geocache) {
    if (this.coins.length > 0) {
      const coin = this.coins.pop()!;
      cache.coins.push(coin);
    }
  }
}

const player = new Player({ lat: INITIAL_LAT, lng: INITIAL_LNG });
let cacheLocations: Geocache[] = [];
const cacheState: Map<string, string> = new Map(); // Map to store serialized cache states

const map = L.map("map").setView([INITIAL_LAT, INITIAL_LNG], 16);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const playerMarker = L.marker([player.position.lat, player.position.lng])
  .addTo(map)
  .bindPopup("This is your location!");

function deterministicRandom(seed: number): number {
  return Math.abs(Math.sin(seed) * 10000) % 1;
}

function generateCache(cell: Cell): Geocache | null {
  if (deterministicRandom(cell.i * RANGE + cell.j) < CACHE_PROBABILITY) {
    const id = `cache_${cell.i}_${cell.j}`;
    const location = { lat: cell.i * GRID_SIZE, lng: cell.j * GRID_SIZE };
    const coins: Coin[] = [];
    const numCoins = Math.floor(deterministicRandom(cell.i + cell.j + 1) * 5);
    for (let coinSerial = 0; coinSerial < numCoins; coinSerial++) {
      coins.push({ id: `${cell.i}:${cell.j}#${coinSerial}` });
    }
    const cache = new Geocache(id, location, coins);
    cacheState.set(id, cache.toMomento()); // Save cache state
    return cache;
  }
  return null;
}

function restoreCache(cacheId: string): Geocache | null {
  const momento = cacheState.get(cacheId);
  if (momento) {
    const cache = new Geocache("", { lat: 0, lng: 0 });
    cache.fromMomento(momento); // Restore cache state
    return cache;
  }
  return null;
}

function updateVisibleCaches() {
    const visibleCacheIds = new Set<string>();
    cacheLocations = [];
    const playerCell = latLngToCell(player.position);
  
    // Loop through cells within RANGE of the player's current cell
    for (let i = -RANGE; i <= RANGE; i++) {
      for (let j = -RANGE; j <= RANGE; j++) {
        const cell: Cell = { i: playerCell.i + i, j: playerCell.j + j };
        const cacheId = `cache_${cell.i}_${cell.j}`;
        visibleCacheIds.add(cacheId);
  
        // Restore or generate cache
        if (cacheState.has(cacheId)) {
          const restoredCache = restoreCache(cacheId);
          if (restoredCache) cacheLocations.push(restoredCache);
        } else {
          const newCache = generateCache(cell);
          if (newCache) cacheLocations.push(newCache);
        }
      }
    }
  
    // Remove markers for caches that are out of range
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        const markerId = (layer as any).options.cacheId;
        if (markerId && !visibleCacheIds.has(markerId)) {
          map.removeLayer(layer);
        }
      }
    });
  
    updateCacheMarkers(); // Add or update markers for visible caches
  }
  
 function updateCacheMarkers() {
  cacheLocations.forEach((cache) => {
    const marker = L.marker([cache.location.lat, cache.location.lng], {
      cacheId: cache.id, 
    }).addTo(map);

    const getPopupContent = () => `
      <b>Cache at (${cache.location.lat.toFixed(5)}, ${cache.location.lng.toFixed(5)})</b><br>
      Coins: ${cache.coins.map((coin) => coin.id).join(", ") || "(empty)"}<br>
      <div>
        <button id="collect-btn-${cache.id}" class="popup-btn">Collect Coins</button>
        <button id="deposit-btn-${cache.id}" class="popup-btn">Deposit Coins</button>
      </div>
    `;

    marker.bindPopup(getPopupContent());

    marker.on("popupopen", () => {
      const collectBtn = document.getElementById(`collect-btn-${cache.id}`);
      const depositBtn = document.getElementById(`deposit-btn-${cache.id}`);

      if (collectBtn) {
        collectBtn.addEventListener("click", () => {
          collectCoins(cache.id);

          // Update the popup content dynamically
          const popup = marker.getPopup();
          if (popup) {
            popup.setContent(getPopupContent());
          }
        });
      }

      if (depositBtn) {
        depositBtn.addEventListener("click", () => {
          depositCoins(cache.id);

          // Update the popup content dynamically
          const popup = marker.getPopup();
          if (popup) {
            popup.setContent(getPopupContent());
          }
        });
      }
    });
  });
}
   

  function collectCoins(cacheId: string) {
    const cache = cacheLocations.find((c) => c.id === cacheId);
  
    if (!cache) {
      alert("Cache not found!");
      return;
    }
  
    if (cache.coins.length === 0) {
      alert("This cache is empty! You cannot collect any more coins.");
      return;
    }
  
    const coin = cache.coins.pop()!;
    player.collectCoin(coin, cacheId);
    cacheState.set(cache.id, cache.toMomento()); // Save updated cache state
  
    alert(`Collected coin: ${coin.id}`);
    renderPlayerInventory(); // Update player's inventory display
  }
   
  const cache = cacheLocations.find((c) => c.id === cacheId);
  if (cache && cache.coins.length > 0) {
    const coin = cache.coins.pop()!;
    player.collectCoin(coin, cacheId);
    cacheState.set(cache.id, cache.toMomento()); // Save updated state
    alert(`Collected coin: ${coin.id}`);
    renderPlayerInventory();
    updateCacheMarkers();
  }


  function depositCoins(cacheId: string) {
    const cache = cacheLocations.find((c) => c.id === cacheId);
  
    if (!cache) {
      alert("Cache not found!");
      return;
    }
  
    if (player.coins.length === 0) {
      alert("You have no coins to deposit!");
      return;
    }
  
    player.depositCoin(cache);
    cacheState.set(cache.id, cache.toMomento()); // Save updated cache state
  
    alert(`Deposited a coin into cache ${cacheId}`);
    renderPlayerInventory(); // Update player's inventory display
  }
  
function renderPlayerInventory() {
  const inventoryDiv = document.getElementById("inventory");
  inventoryDiv!.innerHTML = `Inventory: ${
    player.coins.length > 0
      ? player.coins.map((coin) => coin.id).join(", ")
      : "(empty)"
  }`;
}

function renderButtons() {
    const uiContainer = document.getElementById("ui-container");
  
    const buttonContainer = document.createElement("div");
    buttonContainer.id = "button-container";
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "center";
    buttonContainer.style.margin = "10px 0";
  
    ["⬆️", "⬇️", "⬅️", "➡️"].forEach((buttonText, index) => {
      const btn = document.createElement("button");
      btn.textContent = buttonText;
      btn.style.margin = "5px";
      btn.style.padding = "10px";
      btn.style.fontSize = "20px";
  
      btn.addEventListener("click", () => {
        const directions = ["north", "south", "west", "east"];
        player.move(directions[index]); // Move the player
        map.setView([player.position.lat, player.position.lng]); // Update map view
        playerMarker.setLatLng([player.position.lat, player.position.lng]); // Update player marker
        updateVisibleCaches(); // Regenerate caches
        renderPlayerInventory(); // Update inventory
      });
  
      buttonContainer.appendChild(btn);
    });
  
    uiContainer?.appendChild(buttonContainer); 
  }
      

// Initialize UI
document.addEventListener("DOMContentLoaded", () => {
    const uiContainer = document.createElement("div");
    uiContainer.id = "ui-container";
    uiContainer.style.display = "flex";
    uiContainer.style.flexDirection = "column";
    uiContainer.style.alignItems = "center";
    document.body.appendChild(uiContainer);
  
    const inventoryDiv = document.createElement("div");
    inventoryDiv.id = "inventory";
    inventoryDiv.style.marginTop = "10px";
    uiContainer.appendChild(inventoryDiv);
  
    renderButtons(); // Render movement buttons
    renderPlayerInventory(); // Render inventory display
    updateVisibleCaches(); // Initialize visible caches
  });
  