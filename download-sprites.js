/**
 * Downloader de Sprites Animados Showdown (PokeAPI)
 * Baixa os sprites animados (.gif) dos 1025 Pokémon para a pasta local sprites/
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const spritesDir = path.resolve(__dirname, "sprites");
if (!fs.existsSync(spritesDir)) {
  fs.mkdirSync(spritesDir, { recursive: true });
}

const pokemonListPath = path.resolve(__dirname, "pokemon.json");
if (!fs.existsSync(pokemonListPath)) {
  console.error("pokemon.json não encontrado!");
  process.exit(1);
}

const pokemonList = JSON.parse(fs.readFileSync(pokemonListPath, "utf8"));
console.log(`Iniciando download para ${pokemonList.length} Pokémon...`);

function downloadFile(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      } else {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        resolve(false);
      }
    });

    req.on("error", () => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      resolve(false);
    });

    req.setTimeout(12000, () => {
      req.destroy();
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      resolve(false);
    });
  });
}

async function downloadPokemon(poke) {
  const destId = path.join(spritesDir, `${poke.id}.gif`);
  const destName = path.join(spritesDir, `${poke.name}.gif`);

  // Se já existe e não está vazio
  if (fs.existsSync(destId) && fs.statSync(destId).size > 100) {
    if (!fs.existsSync(destName)) {
      try { fs.copyFileSync(destId, destName); } catch (e) {}
    }
    return { id: poke.id, name: poke.name, status: "EXISTS" };
  }

  // 1. Tenta PokeAPI Showdown por ID
  const pokeApiUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${poke.id}.gif`;
  let ok = await downloadFile(pokeApiUrl, destId);

  // 2. Se falhar, tenta Showdown gen5ani
  if (!ok) {
    const cleanName = poke.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
    ok = await downloadFile(`https://play.pokemonshowdown.com/sprites/gen5ani/${cleanName}.gif`, destId);
  }

  // 3. Se falhar, tenta Showdown ani (3D model)
  if (!ok) {
    const cleanName = poke.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
    ok = await downloadFile(`https://play.pokemonshowdown.com/sprites/ani/${cleanName}.gif`, destId);
  }

  if (ok && fs.existsSync(destId) && fs.statSync(destId).size > 100) {
    try { fs.copyFileSync(destId, destName); } catch (e) {}
    return { id: poke.id, name: poke.name, status: "DOWNLOADED" };
  }

  return { id: poke.id, name: poke.name, status: "NOT_FOUND" };
}

// Pool com concorrência controlada
async function runPool(items, concurrency, fn) {
  let index = 0;
  let completed = 0;
  let downloaded = 0;
  let existed = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      const res = await fn(items[i]);
      completed++;
      if (res.status === "DOWNLOADED") downloaded++;
      if (res.status === "EXISTS") existed++;

      if (completed % 25 === 0 || completed === items.length) {
        process.stdout.write(`\rProgresso: ${completed}/${items.length} (${downloaded} baixados, ${existed} já existiam)`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log(`\nConcluído! Total: ${completed}, Baixados: ${downloaded}, Já existiam: ${existed}`);
}

runPool(pokemonList, 15, downloadPokemon);
