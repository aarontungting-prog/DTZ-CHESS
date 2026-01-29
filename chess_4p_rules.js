export class Chess4P {
    constructor() {
        this.board = []; 
        this.colors = ['red', 'blue', 'yellow', 'green']; 
        this.turnIndex = 0; 
        this.initBoard();
    }
    initBoard() {
        for(let r=0; r<14; r++) this.board[r] = new Array(14).fill(null);
        const dead = [{r:[0,3], c:[0,3]}, {r:[0,3], c:[11,14]}, {r:[11,14], c:[0,3]}, {r:[11,14], c:[11,14]}];
        for(let z of dead) for(let r=z.r[0]; r<z.r[1]; r++) for(let c=z.c[0]; c<z.c[1]; c++) this.board[r][c] = 'X';
        this.setupPieces();
    }
    setupPieces() {
        const p = ['r', 'n', 'b', 'k', 'q', 'b', 'n', 'r']; 
        this.place('red', 13, 12, false, p, 'row');
        this.place('blue', 0, 1, false, p, 'col');
        this.place('yellow', 0, 1, true, p, 'row');
        this.place('green', 13, 12, true, p, 'col');
    }
    place(col, back, pawn, rev, list, mode) {
        const pcs = rev ? [...list].reverse() : list;
        for(let i=0; i<8; i++) {
            let rB = mode==='row'? back : 3+i, cB = mode==='row'? 3+i : back;
            let rP = mode==='row'? pawn : 3+i, cP = mode==='row'? 3+i : pawn;
            this.board[rB][cB] = { type: pcs[i], color: col };
            this.board[rP][cP] = { type: 'p', color: col };
        }
    }
    turn() { return this.colors[this.turnIndex]; }
    move(from, to) {
        const piece = this.board[from.r][from.c];
        const target = this.board[to.r][to.c];
        // 簡單驗證：不能吃自己，不能走死區
        if (!piece || piece.color !== this.turn() || target === 'X' || (target && target.color === piece.color)) return null;
        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = null;
        this.turnIndex = (this.turnIndex + 1) % 4;
        return { from, to, color: piece.color };
    }
    getBoard() { return this.board; }
}

