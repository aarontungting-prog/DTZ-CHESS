
// 四人西洋棋核心規則
export class Chess4P {
    constructor() {
        this.board = []; 
        this.colors = ['red', 'blue', 'yellow', 'green']; 
        this.turnIndex = 0; 
        this.initBoard();
    }

    initBoard() {
        // 14x14 棋盤
        for(let r=0; r<14; r++) {
            this.board[r] = new Array(14).fill(null);
        }
        // 死區
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
        this.placeRow('red', 13, 12, false, pieces, 'row');
        this.placeRow('blue', 0, 1, false, pieces, 'col');
        this.placeRow('yellow', 0, 1, true, pieces, 'row');
        this.placeRow('green', 13, 12, true, pieces, 'col');
    }

    placeRow(color, back, pawn, reverse, list, type) {
        const row = reverse ? [...list].reverse() : list;
        for(let i=0; i<8; i++) {
            let rB = type==='row' ? back : 3+i;
            let cB = type==='row' ? 3+i : back;
            let rP = type==='row' ? pawn : 3+i;
            let cP = type==='row' ? 3+i : pawn;
            
            this.board[rB][cB] = { type: row[i], color: color, hasMoved: false };
            this.board[rP][cP] = { type: 'p', color: color, hasMoved: false };
        }
    }

    turn() { return this.colors[this.turnIndex]; }

    move(from, to) {
        const piece = this.board[from.r][from.c];
        const target = this.board[to.r][to.c];

        if (!piece) return null;
        if (piece.color !== this.turn()) return null; 
        if (target === 'X') return null; 
        if (target && target.color === piece.color) return null; 

        // 簡化移動：吃子與移動
        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = null;
        this.turnIndex = (this.turnIndex + 1) % 4;

        return { from, to, color: piece.color, captured: target };
    }

    getBoard() { return this.board; }
}

