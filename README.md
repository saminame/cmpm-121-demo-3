# cmpm-121-demo-3

## Overview
This is a geocaching game built with TypeScript and Leaflet. The player can collect coins from caches and deposit them into others. Caches and coins are placed on a grid around the player's starting location.

## D3.a Features
- Caches are placed on a map around the player’s starting location.
- Each cache has coins that can be collected or deposited.
- The player and caches are shown on a map with popups.

## D3.b Features
- The grid is based on a global system starting at (0°N, 0°E).
- Coins are labeled with their cache and number (e.g., `369894:-1220627#0`).
- The player’s inventory updates as coins are collected or deposited.

### D3.c
- The player can move their location on the map using ⬆️⬇️⬅️➡️ buttons.
- The map view and nearby caches are updated dynamically as the player moves.
- The Memento pattern is used to save and restore the state of caches, ensuring that their contents remain consistent even when moving in and out of range.
- Player movement is aligned with the grid system (0.0001 degrees per step), and cache visibility is limited to nearby locations.

### D3.d
-
