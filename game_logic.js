
// 在 sendMove 函數中，我們確保傳送完整資訊
function sendMove(move) {
    if (!isOnline) return;
    const nextFen = game.fen();
    
    // chess.js 的 move 物件已經包含了 flags (例如 'c' 為入堡, 'e' 為吃過路兵)
    let updateData = { 
        fen: nextFen, 
        turn: game.turn(), 
        lastMove: move,
        timestamp: Date.now() 
    };

    // 檢查勝負
    if (game.in_checkmate()) {
        const winnerColor = game.turn() === 'w' ? 'b' : 'w'; 
        updateData.winner = winnerColor;
        updateData.status = 'finished';
        calculateELO(winnerColor);
    } else if (game.in_draw()) {
        updateData.winner = 'draw';
        updateData.status = 'finished';
    }

    update(ref(db, 'games/' + gameId), updateData);
    isProcessing = false;
}

// 處理點擊與規則驗證
function handleSquareClick(sq) {
    if(isProcessing) return;
    if(isOnline && game.turn() !== playerColor) return;

    const p = game.get(sq);
    if(!selectedSquare) {
        // 選取棋子
        if(p && p.color === game.turn()) {
            selectedSquare = sq;
            const validMoves = game.moves({square: sq, verbose: true});
            Visuals.highlightSquare(sq, validMoves);
        }
    } else {
        // 嘗試移動
        const move = game.move({
            from: selectedSquare, 
            to: sq, 
            promotion: 'q' // 預設升變為皇后，符合快速對戰邏輯
        });

        if(move) {
            isProcessing = true;
            Visuals.animateMove(move, () => {
                Visuals.syncBoardVisuals(game);
                updateStatusHUD();
                if(isOnline) sendMove(move);
                else {
                    // 單機模式：電腦隨機下棋
                    if(!game.game_over()) setTimeout(makeRandomAI, 500);
                    else isProcessing = false;
                }
            });
            selectedSquare = null;
        } else {
            // 如果點擊的是另一個自己的棋子，則切換選取
            if(p && p.color === game.turn()) {
                selectedSquare = sq;
                const validMoves = game.moves({square: sq, verbose: true});
                Visuals.highlightSquare(sq, validMoves);
            } else {
                selectedSquare = null;
                Visuals.clearHighlights();
            }
        }
    }
}
