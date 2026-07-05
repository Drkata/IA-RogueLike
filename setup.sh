#!/bin/bash

# Exit immediately if any command fails
set -e

# Clear screen
clear

# Show welcome banner
echo -e "\e[1;36m"
echo "  ______________________________________________________"
echo " /                                                      \\"
echo " |          🪄   WELCOME TO IA-ROGUELIKE   🪄          |"
echo " |      Medieval Fantasy 3D Magic Staff Shooter         |"
echo " \______________________________________________________/"
echo -e "\e[0m"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "\e[1;31m[ERREUR] Node.js n'est pas installé sur votre système !\e[0m"
    echo "Pour jouer, vous devez installer Node.js (version 18 ou supérieure)."
    echo "👉 Téléchargez-le ici : https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "\e[1;31m[ERREUR] npm n'est pas installé sur votre système !\e[0m"
    echo "Veuillez installer npm (généralement inclus avec Node.js)."
    exit 1
fi

echo -e "\e[1;32m[1/3] Node.js et npm détectés avec succès.\e[0m"
echo "      Version Node.js : $(node -v)"
echo "      Version npm     : $(npm -v)"
echo ""

# Install dependencies
echo -e "\e[1;32m[2/3] Installation des dépendances (npm install)...\e[0m"
npm install
echo -e "\e[1;32m      Dépendances installées avec succès !\e[0m"
echo ""

# Start the game
echo -e "\e[1;36m"
echo "  ______________________________________________________"
echo " /                                                      \\"
echo " |   🎉  L'installation est terminée avec succès !      |"
echo " |   👉  Ouvrez votre navigateur sur :                 |"
echo " |       http://localhost:5173                          |"
echo " \______________________________________________________/"
echo -e "\e[0m"
echo "Lancement du serveur de développement dans 3 secondes..."
sleep 3

npm run dev
