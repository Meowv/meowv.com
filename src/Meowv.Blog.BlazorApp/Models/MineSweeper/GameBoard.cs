using Meowv.Blog.BlazorApp.Models.MineSweeper.Enums;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace Meowv.Blog.BlazorApp.Models.MineSweeper
{
    public class GameBoard
    {
        public int Width { get; set; } = 16;

        public int Height { get; set; } = 16;

        public int MineCount { get; set; } = 40;

        public List<Panel> Panels { get; set; }

        public GameStatus Status { get; set; }

        public Stopwatch Stopwatch { get; set; }

        public int MinesRemaining => MineCount - Panels.Where(x => x.IsFlagged).Count();

        public GameBoard()
        {
            Reset();
        }

        public void Reset()
        {
            Initialize(Width, Height, MineCount);
            Stopwatch = new Stopwatch();
        }

        public void Initialize(int width, int height, int mines)
        {
            Width = width;
            Height = height;
            MineCount = mines;
            Panels = new List<Panel>();

            int id = 1;
            for (int i = 1; i <= height; i++)
            {
                for (int j = 1; j <= width; j++)
                {
                    Panels.Add(new Panel(id, j, i));
                    id++;
                }
            }

            Status = GameStatus.AwaitingFirstMove;
        }

        public void MakeMove(int x, int y)
        {
            if (Status == GameStatus.AwaitingFirstMove)
            {
                FirstMove(x, y);
            }
            RevealPanel(x, y);
        }

        public List<Panel> GetNeighbors(int x, int y)
        {
            var nearbyPanels = Panels.Where(panel => panel.X >= (x - 1) && panel.X <= (x + 1)
                                                    && panel.Y >= (y - 1) && panel.Y <= (y + 1));
            var currentPanel = Panels.Where(panel => panel.X == x && panel.Y == y);
            return nearbyPanels.Except(currentPanel).ToList();
        }

        public void RevealPanel(int x, int y)
        {
            //Step 1: Find and reveal the clicked panel
            var selectedPanel = Panels.First(panel => panel.X == x && panel.Y == y);
            selectedPanel.Reveal();

            //Step 2: If the panel is a mine, show all mines. Game over!
            if (selectedPanel.IsMine)
            {
                Status = GameStatus.Failed; //Game over!
                RevealAllMines();
                return;
            }

            //Step 3: If the panel is a zero, cascade reveal neighbors
            if (selectedPanel.AdjacentMines == 0)
            {
                RevealZeros(x, y);
            }

            //Step 4: If this move caused the game to be complete, mark it as such
            CompletionCheck();
        }

        public void FirstMove(int x, int y)
        {
            Random rand = new Random();

            //For any board, take the user's first revealed panel + any neighbors of that panel, and mark them as unavailable for mine placement.
            var neighbors = GetNeighbors(x, y); //Get all neighbors
            neighbors.Add(Panels.First(z => z.X == x && z.Y == y));

            //Select random panels from set which are not excluded
            var mineList = Panels.Except(neighbors).OrderBy(user => rand.Next());
            var mineSlots = mineList.Take(MineCount).ToList().Select(z => new { z.X, z.Y });

            //Place the mines
            foreach (var mineCoord in mineSlots)
            {
                Panels.Single(panel => panel.X == mineCoord.X && panel.Y == mineCoord.Y).IsMine = true;
            }

            //For every panel which is not a mine, determine and save the adjacent mines.
            foreach (var openPanel in Panels.Where(panel => !panel.IsMine))
            {
                var nearbyPanels = GetNeighbors(openPanel.X, openPanel.Y);
                openPanel.AdjacentMines = nearbyPanels.Count(z => z.IsMine);
            }

            Status = GameStatus.InProgress;
            Stopwatch.Start();
        }

        public void RevealZeros(int x, int y)
        {
            //Get all neighbor panels
            var neighborPanels = GetNeighbors(x, y).Where(panel => !panel.IsRevealed);
            foreach (var neighbor in neighborPanels)
            {
                //Reveal the neighbors
                neighbor.IsRevealed = true;

                //If the neighbor is also a 0, reveal all of its neighbors.
                if (neighbor.AdjacentMines == 0)
                {
                    RevealZeros(neighbor.X, neighbor.Y);
                }
            }
        }

        private void RevealAllMines()
        {
            Panels.Where(x => x.IsMine).ToList().ForEach(x => x.IsRevealed = true);
        }

        private void CompletionCheck()
        {
            var hiddenPanels = Panels.Where(x => !x.IsRevealed).Select(x => x.ID);
            var minePanels = Panels.Where(x => x.IsMine).Select(x => x.ID);
            if (!hiddenPanels.Except(minePanels).Any())
            {
                Status = GameStatus.Completed;
                Stopwatch.Stop();
            }
        }

        public void FlagPanel(int x, int y)
        {
            if (MinesRemaining > 0)
            {
                var panel = Panels.Where(z => z.X == x && z.Y == y).First();

                panel.Flag();
            }
        }
    }
}