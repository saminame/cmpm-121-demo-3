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
type Coin = { cell: Cell; serial: number };
type CacheLocation = { id: string; location: Coordinates; coins: Coin[] };

function latLngToCell({ lat, lng }: Coordinates): Cell {
  const i = Math.floor(lat / GRID_SIZE);
  const j = Math.floor(lng / GRID_SIZE);
  return { i, j };
}

class Player {
  position: Coordinates;
  coins: number;

  constructor(position: Coordinates) {
    this.position = position;
    this.coins = 0;
  }

  collectCoin() {
    this.coins++;
  }

  depositCoin(cache: CacheLocation) {
    if (this.coins > 0) {
      cache.coins.push({
        cell: latLngToCell(this.position),
        serial: cache.coins.length,
      });
      this.coins--;
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
  mapDiv.style.height = "30px";
  document.body.appendChild(mapDiv);

  const uiContainer = document.createElement("div");
  uiContainer.id = "ui-container";
  document.body.appendChild(uiContainer);

  const map = L.map("map").setView([INITIAL_LAT, INITIAL_LNG], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  L.marker([player.position.lat, player.position.lng])
    .addTo(map)
    .bindPopup("You are here");

  function deterministicRandom(seed: number): number {
    return Math.abs(Math.sin(seed) * 10000) % 1;
  }

  function generateCache(cell: Cell): CacheLocation | null {
    if (deterministicRandom(cell.i * RANGE + cell.j) < CACHE_PROBABILITY) {
      const location: Coordinates = {
        lat: INITIAL_LAT + cell.i * GRID_SIZE,
        lng: INITIAL_LNG + cell.j * GRID_SIZE,
      };
      const coins: Coin[] = [];
      const numCoins = Math.floor(deterministicRandom(cell.i + cell.j + 1) * 5);
      for (let coinSerial = 0; coinSerial < numCoins; coinSerial++) {
        coins.push({ cell, serial: coinSerial });
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
        Coins: ${cache.coins.length}<br>
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

  function renderVisibleCaches() {
    const uiContainer = document.getElementById("ui-container");
    if (uiContainer) uiContainer.innerHTML = "";

    renderPlayerPosition();

    cacheLocations.forEach((cache) => {
      const cacheButton = document.createElement("button");
      cacheButton.style.background = "white";
      cacheButton.style.border = "2px solid #ccc";
      cacheButton.style.borderRadius = "5px";
      cacheButton.style.transition =
        "background 0.3s, transform 0.3s, border-color 0.3s";
      cacheButton.textContent = `Cache at (${cache.location.lat.toFixed(5)}, ${
        cache.location.lng.toFixed(5)
      }) - Coins: ${cache.coins.length}`;
      cacheButton.addEventListener("click", () => {
        collectCoins(cache.id);
        depositCoins(cache.id);
      });
      cacheButton.addEventListener("mouseover", () => {
        cacheButton.style.background = "#f0f0f0";
        cacheButton.style.transform = "scale(1.05)";
        cacheButton.style.borderColor = "#888";
      });
      cacheButton.addEventListener("mouseout", () => {
        cacheButton.style.background = "white";
        cacheButton.style.transform = "scale(1)";
        cacheButton.style.borderColor = "#ccc";
      });
      uiContainer?.appendChild(cacheButton);
    });
  }

  function renderPlayerPosition() {
    const uiContainer = document.getElementById("ui-container");
    const playerPositionDiv = document.createElement("div");
    playerPositionDiv.style.margin = "20px 0";
    playerPositionDiv.style.padding = "10px";
    playerPositionDiv.style.border = "2px solid #000";
    playerPositionDiv.style.borderRadius = "5px";
    playerPositionDiv.style.backgroundColor = "#fafafa";
    playerPositionDiv.textContent = `Player Position: (${
      player.position.lat.toFixed(
        5,
      )
    }, ${player.position.lng.toFixed(5)})`;
    uiContainer?.appendChild(playerPositionDiv);
  }

  function collectCoins(cacheId: string) {
    const cache = cacheLocations.find((c) => c.id === cacheId);
    if (cache && cache.coins.length > 0) {
      const coin = cache.coins.pop();
      if (coin) {
        player.collectCoin();
        alert(`Collected coin! Total coins: ${player.coins}`);
        updateCacheMarkers();
      }
    }
  }

  function depositCoins(cacheId: string) {
    const cache = cacheLocations.find((c) => c.id === cacheId);
    if (cache && player.coins > 0) {
      player.depositCoin(cache);
      alert(`Deposited coins into cache ${cacheId}`);
      updateCacheMarkers();
    }
  }

  updateVisibleCaches();
  renderVisibleCaches();
});
