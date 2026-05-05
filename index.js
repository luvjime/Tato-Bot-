require("dotenv").config();
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const DB_FILE = "./economy.json";
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function userData(id) {
  if (!db[id]) db[id] = { coins: 0, lastDaily: 0, marriedTo: null };
  if (db[id].marriedTo === undefined) db[id].marriedTo = null;
  return db[id];
}

const commands = [
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your Tato coins"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily Tato coins"),

  new SlashCommandBuilder()
    .setName("work")
    .setDescription("Work for Tato coins"),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Pay another user Tato coins")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Who to pay").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Amount to pay").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See the richest Tato members"),

  new SlashCommandBuilder()
    .setName("marry")
    .setDescription("Propose to someone")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Who to marry").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("divorce")
    .setDescription("Break up")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("Slash commands registered.");
}

client.once("ready", () => {
  console.log(`Tato Economy is online as ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (interaction.isButton()) {
    const [action, proposerId] = interaction.customId.split("_");

    if (interaction.user.id === proposerId) {
      return interaction.reply({
        content: "You can't accept your own proposal.",
        ephemeral: true
      });
    }

    const proposer = userData(proposerId);
    const accepter = userData(interaction.user.id);

    if (action === "accept") {
      if (proposer.marriedTo || accepter.marriedTo) {
        return interaction.update({
          content: "Someone is already married.",
          components: []
        });
      }

      proposer.marriedTo = interaction.user.id;
      accepter.marriedTo = proposerId;
      saveDB();

      return interaction.update({
        content: `<@${proposerId}> and <@${interaction.user.id}> are now married!`,
        components: []
      });
    }

    if (action === "decline") {
      return interaction.update({
        content: "Proposal declined.",
        components: []
      });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const user = userData(interaction.user.id);

  if (interaction.commandName === "balance") {
    return interaction.reply(`You have **${user.coins} Tato Coins**.`);
  }

  if (interaction.commandName === "daily") {
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (now - user.lastDaily < cooldown) {
      const left = cooldown - (now - user.lastDaily);
      const hours = Math.ceil(left / 1000 / 60 / 60);
      return interaction.reply(`You already claimed daily. Come back in **${hours}h**.`);
    }

    user.coins += 250;
    user.lastDaily = now;
    saveDB();

    return interaction.reply("You claimed **250 Tato Coins**!");
  }

  if (interaction.commandName === "work") {
    const jobs = [
      "peeled potatoes",
      "guarded the Tato vault",
      "cleaned the server",
      "fed the Big Z mascot",
      "delivered Tato snacks"
    ];

    const earned = Math.floor(Math.random() * 151) + 50;
    user.coins += earned;
    saveDB();

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    return interaction.reply(`You ${job} and earned **${earned} Tato Coins**.`);
  }

  if (interaction.commandName === "pay") {
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    if (target.bot) return interaction.reply("You can't pay bots.");
    if (amount <= 0) return interaction.reply("Amount must be positive.");
    if (user.coins < amount) return interaction.reply("You don't have enough coins.");

    const receiver = userData(target.id);

    user.coins -= amount;
    receiver.coins += amount;
    saveDB();

    return interaction.reply(`You paid ${target} **${amount} Tato Coins**.`);
  }

  if (interaction.commandName === "leaderboard") {
    const top = Object.entries(db)
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 10);

    const text = top.length
      ? top.map(([id, data], i) => `**${i + 1}.** <@${id}> — ${data.coins} Tato Coins`).join("\n")
      : "No one has coins yet.";

    const embed = new EmbedBuilder()
      .setTitle("Tato Economy Leaderboard")
      .setDescription(text)
      .setColor(0x8a2be2);

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "marry") {
    const target = interaction.options.getUser("user");
    const partner = userData(target.id);

    if (target.id === interaction.user.id) return interaction.reply("You can't marry yourself.");
    if (target.bot) return interaction.reply("You can't marry a bot.");
    if (user.marriedTo) return interaction.reply("You're already married.");
    if (partner.marriedTo) return interaction.reply("They are already married.");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${interaction.user.id}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_${interaction.user.id}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      content: `<@${target.id}>, do you accept <@${interaction.user.id}>'s proposal?`,
      components: [row]
    });
  }

  if (interaction.commandName === "divorce") {
    if (!user.marriedTo) return interaction.reply("You're not married.");

    const partner = userData(user.marriedTo);

    partner.marriedTo = null;
    user.marriedTo = null;
    saveDB();

    return interaction.reply("You are now divorced.");
  }
});

registerCommands();
client.login(process.env.TOKEN);
