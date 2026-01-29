// 四人西洋棋核心邏輯 (MVP版)
export class Chess4P {
    constructor() {
        this.board = []; 
        this.colors = ['red', 'blue', 'yellow', 'green']; 
        this.turnIndex = 0; 
        this.gameOver = false;
        this.initBoard();
    }

    initBoard() {
        for(let r=0; r<14; r++) {
            this.board[r] = new Array(14).fill(null);
        }
        const dead = [
            {r:[0,3], c:[0,3]}, {r:[0,3], c:[11,14]},
            {r:[11,14], c:[0,3]}, {r:[11,14], c:[11,14]}
        ];
        for(let z of dead) {
            for(let r=z.r[0]; r<z.r[1]; r++) {
                for(let c=z.c[0]; c<z.c[1]; c++) this.board[r][c] = 'X';
            }
        }
        this.setupPieces();
    }

    setupPieces() {
        const pieces = ['r', 'n', 'b', 'k', 'q', 'b', 'n', 'r']; 
        this.placeRow('red', 13, 12, 3, pieces, false);
        this.placeCol('blue', 0, 1, 3, pieces, false);
        this.placeRow('yellow', 0, 1, 3, pieces, true); 
        this.placeCol('green', 13, 12, 3, pieces, true);
    }

    placeRow(color, backR, pawnR, offset, list, reverse) {
        const row = reverse ? [...list].reverse() : list;
        for(let i=0; i<8; i++) {
            this.board[backR][offset+i] = { type: row[i], color: color, hasMoved: false };
            this.board[pawnR][offset+i] = { type: 'p', color: color, hasMoved: false };
        }
    }

    placeCol(color, backC, pawnC, offset, list, reverse) {
        const col = reverse ? [...list].reverse() : list;
        for(let i=0; i<8; i++) {
            this.board[offset+i][backC] = { type: col[i], color: color, hasMoved: false };
            this.board[offset+i][pawnC] = { type: 'p', color: color, hasMoved: false };
        }
    }

    turn() { return this.colors[this.turnIndex]; }

    move(from, to) {
        if(this.gameOver) return null;
        const piece = this.board[from.r][from.c];
        const target = this.board[to.r][to.c];

        if (!piece) return null;
        if (piece.color !== this.turn()) return null; 
        if (target === 'X') return null; 
        if (target && target.color === piece.color) return null; 

        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = null;
        piece.hasMoved = true;

        this.turnIndex = (this.turnIndex + 1) % 4;

        return { from, to, color: piece.color, captured: target };
    }

    getBoard() { return this.board; }
}
