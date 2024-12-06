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
type Coin = { id: string }; // Compact representation like "i:j#serial"
type CacheLocation = { id: string; location: Coordinates; coins: Coin[] };

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
  coins: Coin[]; // Coins in the player’s inventory
  visitedCaches: Set<string>; // Set of cache IDs the player has visited

  constructor(position: Coordinates) {
    this.position = position;
    this.coins = [];
    this.visitedCaches = new Set();
  }

  collectCoin(coin: Coin, cacheId: string) {
    this.coins.push(coin);
    this.visitedCaches.add(cacheId); // Mark the cache as visited
  }

  depositCoin(cache: CacheLocation) {
    if (this.coins.length > 0) {
      const coin = this.coins.pop()!;
      cache.coins.push(coin);
    }
  }
}

const player = new Player({ lat: INITIAL_LAT, lng: INITIAL_LNG });
let cacheLocations: CacheLocation[] = [];
const cacheState: Map<string, CacheLocation> = new Map();

document.addEventListener("DOMContentLoaded", () => {
  const mapDiv = document.createElement("div");
  mapDiv.id = "map";
  mapDiv.style.width = "100%";
  mapDiv.style.height = "10px";
  document.body.appendChild(mapDiv);

  const map = L.map("map").setView([INITIAL_LAT, INITIAL_LNG], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  L.marker([player.position.lat, player.position.lng])
    .addTo(map)
    .bindPopup("This is your location!");

  function deterministicRandom(seed: number): number {
    return Math.abs(Math.sin(seed) * 10000) % 1;
  }

  function generateCache(cell: Cell): CacheLocation | null {
    if (deterministicRandom(cell.i * RANGE + cell.j) < CACHE_PROBABILITY) {
      const location: Coordinates = {
        lat: cell.i * GRID_SIZE,
        lng: cell.j * GRID_SIZE,
      };
      const coins: Coin[] = [];
      const numCoins = Math.floor(deterministicRandom(cell.i + cell.j + 1) * 5);
      for (let coinSerial = 0; coinSerial < numCoins; coinSerial++) {
        coins.push({ id: `${cell.i}:${cell.j}#${coinSerial}` });
      }
      const cache: CacheLocation = {
        id: `cache_${cell.i}_${cell.j}`,
        location,
        coins,
      };
      cacheState.set(cache.id, cache);
      return cache;
    }
    return null;
  }

  function renderPlayerInventory() {
    const uiContainer = document.getElementById("ui-container");
    const inventoryDiv = document.createElement("div");
    inventoryDiv.style.margin = "10px 0";
    inventoryDiv.style.padding = "10px";
    inventoryDiv.style.border = "1px solid #ccc";
    inventoryDiv.style.borderRadius = "5px";
    inventoryDiv.style.backgroundColor = "#f9f9f9";

    const inventoryText = player.coins.length
      ? `Inventory: ${player.coins.map((coin) => coin.id).join(", ")}`
      : "Inventory: (empty)";

    inventoryDiv.textContent = inventoryText;

    if (uiContainer) {
      const existingInventoryDiv = uiContainer.querySelector(".inventory");
      if (existingInventoryDiv) {
        existingInventoryDiv.replaceWith(inventoryDiv);
      } else {
        inventoryDiv.classList.add("inventory");
        uiContainer.appendChild(inventoryDiv);
      }
    }
  }

  function updateVisibleCaches() {
    cacheLocations = [];
    const playerCell = latLngToCell(player.position);

    for (let i = -RANGE; i <= RANGE; i++) {
      for (let j = -RANGE; j <= RANGE; j++) {
        const cell: Cell = { i: playerCell.i + i, j: playerCell.j + j };
        const cacheId = `cache_${cell.i}_${cell.j}`;
        if (cacheState.has(cacheId)) {
          cacheLocations.push(cacheState.get(cacheId)!);
        } else {
          const newCache = generateCache(cell);
          if (newCache) cacheLocations.push(newCache);
        }
      }
    }
    updateCacheMarkers();
  }

  function updateCacheMarkers() {
    cacheLocations.forEach((cache) => {
      const marker = L.marker([cache.location.lat, cache.location.lng]).addTo(
        map,
      );

      marker.bindPopup(`
        <b>Cache at (${cache.location.lat.toFixed(5)}, ${
        cache.location.lng.toFixed(5)
      })</b><br>
        Coins: ${cache.coins.map((coin) => coin.id).join(", ")}<br>
        <div>
          <button id="collect-btn-${cache.id}" class="popup-btn">Collect Coins</button>
          <button id="deposit-btn-${cache.id}" class="popup-btn">Deposit Coins</button>
        </div>
      `);

      marker.on("popupopen", () => {
        const collectBtn = document.getElementById(`collect-btn-${cache.id}`);
        const depositBtn = document.getElementById(`deposit-btn-${cache.id}`);

        if (collectBtn) {
          collectBtn.addEventListener("click", () => {
            collectCoins(cache.id);
            updateVisibleCaches();
          });
        }

        if (depositBtn) {
          depositBtn.addEventListener("click", () => {
            depositCoins(cache.id);
            updateVisibleCaches();
          });
        }
      });
    });
  }

  function collectCoins(cacheId: string) {
    if (player.visitedCaches.has(cacheId)) {
      alert("You have already visited this cache!");
      return;
    }

    const cache = cacheLocations.find((c) => c.id === cacheId);
    if (cache && cache.coins.length > 0) {
      const coin = cache.coins.pop()!;
      player.collectCoin(coin, cacheId);
      alert(`Collected coin: ${coin.id}`);
      renderPlayerInventory(); // Update inventory display
      updateCacheMarkers();
    }
  }

  function depositCoins(cacheId: string) {
    const cache = cacheLocations.find((c) => c.id === cacheId);
    if (cache && player.coins.length > 0) {
      player.depositCoin(cache);
      alert(`Deposited a coin into cache ${cacheId}`);
      renderPlayerInventory(); // Update inventory display
      updateCacheMarkers();
    }
  }

  updateVisibleCaches();

  // Add player inventory section
  const uiContainer = document.createElement("div");
  uiContainer.id = "ui-container";
  document.body.appendChild(uiContainer);
  renderPlayerInventory();
});
