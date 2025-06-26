// --- 게임 상수 ---
const SCREEN_WIDTH = 900; // 캔버스 너비
const SCREEN_HEIGHT = 900; // 캔버스 높이
const HEX_RADIUS = 40; // 육각형의 반지름 (중심에서 각 꼭짓점까지의 거리)

// 육각형 중심에서 변의 중심까지의 거리 (apothem)
const HEX_APOTHEM = HEX_RADIUS * Math.sqrt(3) / 2;

// 색상
const COLORS = {
    WHITE: '#FFFFFF',
    BLACK: '#000000',
    GRAY: '#CCCCCC', // 그리드 라인
    RED: '#FF0000',   // 180도 타일 (직선)
    GREEN: '#00FF00', // 120도 타일
    BLUE: '#0000FF',  // 60도 타일
    YELLOW: '#FFFF00', // 드래그 중인 타일 강조
    LIGHT_BLUE: '#ADD8E6' // 선택된 타일 버튼 강조
};

// 타일 종류 (각도)
const TILE_60 = 60;
const TILE_120 = 120;
const TILE_180 = 180;
const ALL_TILE_TYPES = [TILE_60, TILE_120, TILE_180];

// UI 요소 (HTML과 ID 일치 확인)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const currentPlayerText = document.getElementById('currentPlayerText');
const turnTilesText = document.getElementById('turnTilesText');
const totalPlacedTilesText = document.getElementById('totalPlacedTilesText');
const selectedTileInfo = document.getElementById('selectedTileInfo');
const rotationInfo = document.getElementById('rotationInfo');

const select60TileButton = document.getElementById('select60TileButton');
const select120TileButton = document.getElementById('select120TileButton');
const select180TileButton = document.getElementById('select180TileButton');

const rotateButton = document.getElementById('rotateButton');
const endTurnButton = document.getElementById('endTurnButton');
const declareImpossibleButton = document.getElementById('declareImpossibleButton');
const messageOverlay = document.getElementById('messageOverlay');
const messageContent = document.getElementById('messageContent');
const closeMessageButton = document.getElementById('closeMessageButton');
const restartGameButton = document.getElementById('restartGameButton');

canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

// --- 헬퍼 함수 ---
// 육각형 큐브 좌표를 픽셀 좌표로 변환 (원점 (0,0) 기준)
function hexToPixel(q, r, hexRadius = HEX_RADIUS) {
    const x = hexRadius * (3/2 * q);
    const y = hexRadius * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
    return { x, y };
}

// 픽셀 좌표를 육각형 큐브 좌표로 변환 (원점 (0,0) 기준)
function pixelToHex(x, y, hexRadius = HEX_RADIUS) {
    const q_float = (x * 2/3) / hexRadius;
    const r_float = (-x / 3 + Math.sqrt(3)/3 * y) / hexRadius;
    
    return hexRound(q_float, r_float);
}

// 부동 소수점 육각형 좌표를 가장 가까운 정수 육각형 좌표로 반올림
function hexRound(q, r) {
    let x_cube = q;
    let z_cube = r;
    let y_cube = -x_cube - z_cube;

    let rx = Math.round(x_cube);
    let ry = Math.round(y_cube);
    let rz = Math.round(z_cube);

    const x_diff = Math.abs(rx - x_cube);
    const y_diff = Math.abs(ry - y_cube);
    const z_diff = Math.abs(rz - z_cube);

    if (x_diff > y_diff && x_diff > z_diff) {
        rx = -ry - rz;
    } else if (y_diff > z_diff) {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }
    
    return { q: rx, r: rz };
}

// 육각형의 꼭짓점 좌표 배열 반환 (중심 (0,0) 기준)
function getHexCorners(centerX, centerY, hexRadius = HEX_RADIUS) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        // 플랫 탑 육각형의 꼭짓점은 0도 (오른쪽 중간)에서 시작하여 60도 간격으로 생성됩니다.
        const angle_deg = 0 + 60 * i;
        const angle_rad = Math.PI / 180 * angle_deg;
        const x = centerX + hexRadius * Math.cos(angle_rad);
        const y = centerY + hexRadius * Math.sin(angle_rad);
        corners.push({ x, y });
    }
    return corners;
}

// 특정 방향의 이웃 육각형 좌표 반환
// 방향 인덱스는 0:오른쪽, 1:오른쪽아래, ..., 5:오른쪽위
function getNeighborHex(q, r, direction) {
    const directions = [
        { dq: 1, dr: 0 },    // 0 (오른쪽)
        { dq: 0, dr: 1 },    // 1 (오른쪽 아래)
        { dq: -1, dr: 1 },   // 2 (왼쪽 아래)
        { dq: -1, dr: 0 },   // 3 (왼쪽)
        { dq: 0, dr: -1 },   // 4 (왼쪽 위)
        { dq: 1, dr: -1 }    // 5 (오른쪽 위)
    ];
    const { dq, dr } = directions[direction];
    return { q: q + dq, r: r + dr };
}

// 육각형 변의 중심 좌표 얻기 (중심 (0,0) 기준)
// 포트 인덱스는 0부터 5까지 (0:오른쪽, 1:오른쪽아래, ..., 5:오른쪽위)
function getHexEdgeMidpoint(centerX, centerY, portIndex, hexApothem = HEX_APOTHEM) {
    // 변의 중심은 꼭짓점 사이의 30도, 90도, 150도, ... 위치에 있습니다.
    const angle_deg = 30 + 60 * portIndex; 
    const angle_rad = Math.PI / 180 * angle_deg;
    const x = centerX + hexApothem * Math.cos(angle_rad);
    const y = centerY + hexApothem * Math.sin(angle_rad);
    return { x, y };
}


// --- 게임 클래스 ---
class Tile {
    constructor(tileType, rotation = 0) {
        this.tileType = tileType;
        this.rotation = rotation; // 0, 60, 120, 180, 240, 300 (도)
        this.q = null;
        this.r = null;
        this.placed = false;
        this.placedThisTurn = false;

        // 이 타일의 철로가 연결하는 포트 쌍 정의 (로컬 인덱스 기준, 0도 회전 기준)
        this.initialConnections = this.getConnectionsForType(tileType);
    }

    // 타일 타입에 따른 기본 연결 정보 반환 (0도 회전 기준)
    getConnectionsForType(type) {
        switch(type) {
            case TILE_60: // 0-1 연결 (기본 60도 타일)
                return [[0, 1]];
            case TILE_120: // 0-2 연결 (기본 120도 타일)
                return [[0, 2]];
            case TILE_180: // 0-3 연결 (기본 직선 타일)
                return [[0, 3]];
            default:
                return [];
        }
    }

    // 타일을 60도씩 회전시키고, rotation 값을 업데이트합니다.
    rotate() {
        // 현재 rotation 값을 60도 증가시키고, 360으로 나눈 나머지로 설정
        this.rotation = (this.rotation + 60) % 360; 
        console.log(`Tile rotated. New rotation: ${this.rotation} degrees.`); // 회전 값 확인용 로그
    }

    // 현재 타일의 회전에 따라 실제 연결되는 포트 인덱스 쌍을 반환합니다.
    // 여기서 반환되는 인덱스는 전역 포트 인덱스(0~5)와 동일하게 사용됩니다.
    getCurrentLocalConnections() {
        const rotationSteps = this.rotation / 60; // 현재 rotation 값을 60으로 나누어 회전 스텝 계산
        return this.initialConnections.map(pair => {
            // 각 초기 포트 인덱스에 회전 스텝을 더하고 6으로 나눈 나머지를 취하여 새로운 포트 인덱스를 얻습니다.
            // JavaScript의 % 연산은 음수에 대해 예상과 다르게 동작할 수 있으므로, (x % n + n) % n 패턴을 사용하면 안전하지만,
            // 여기서는 rotation이 항상 0 이상이므로 단순히 % 6으로도 충분합니다.
            return [(pair[0] + rotationSteps) % 6, (pair[1] + rotationSteps) % 6];
        });
    }

    draw(context, centerX, centerY, isSelected = false) {
        context.save();
	context.translate(centerX, centerY);
        // 선택된 타일 배경
        if (isSelected) {
            context.fillStyle = COLORS.YELLOW;
            context.beginPath();
            getHexCorners(0, 0, HEX_RADIUS).forEach((p, i) => {
                if (i === 0) context.moveTo(p.x, p.y);
                else context.lineTo(p.x, p.y);
            });
            context.closePath();
            context.fill();
        }

        // 육각형 테두리 그리기
        context.strokeStyle = COLORS.BLACK;
        context.lineWidth = 2;
        context.beginPath();
        getHexCorners(0, 0, HEX_RADIUS).forEach((p, i) => {
            if (i === 0) context.moveTo(p.x, p.y);
            else context.lineTo(p.x, p.y);
        });
        context.closePath();
        context.stroke();

        // 타일 종류에 따른 철로 그리기
        const lineThickness = 5;
        context.lineWidth = lineThickness;
        context.lineCap = 'round';
        context.strokeStyle = this.getColorForType(this.tileType);

        // 육각형 중심점 (0,0)을 경유하여 레일 그리기
        const hexCenter = { x: 0, y: 0 }; 

        for (const [p1_rotated_global, p2_rotated_global] of this.getCurrentLocalConnections()) {
            const edge1 = getHexEdgeMidpoint(0, 0, p1_rotated_global);
            const edge2 = getHexEdgeMidpoint(0, 0, p2_rotated_global);
            
            context.beginPath();
            context.moveTo(edge1.x, edge1.y);
            context.lineTo(hexCenter.x, hexCenter.y); // 변 중심 -> 육각형 중심
            context.lineTo(edge2.x, edge2.y);        // 육각형 중심 -> 다른 변 중심
            context.stroke();
        }
        
        context.restore();
    }

    getColorForType(type) {
        switch(type) {
            case TILE_60: return COLORS.BLUE;
            case TILE_120: return COLORS.GREEN;
            case TILE_180: return COLORS.RED;
            default: return COLORS.BLACK;
        }
    }

    setPosition(q, r) {
        this.q = q;
        this.r = r;
        this.placed = true;
    }
}

class Game {
    constructor() {
        this.board = new Map(); // Map<(q, r) string> -> Tile object
        
        this.currentPlayer = 1;
        this.placedTilesThisTurn = 0; // 이번 턴에 놓은 타일 개수 (최대 3개)
        this.totalPlacedTiles = 0; // 플레이어가 놓은 총 타일 개수 (시작 타일 제외)
        this.maxPlayerPlaceableTiles = 18; // 플레이어가 놓을 수 있는 최대 타일 개수 (예시)

        // 시작 기차역 타일 배치 (총 타일 개수에 포함시키지 않음)
        this.startStation1 = new Tile(TILE_180, 0); 
        this.startStation1.setPosition(0, 0); 
        this.board.set(this.getHexKey(0, 0), this.startStation1);

        this.startStation2 = new Tile(TILE_180, 0); 
        this.startStation2.setPosition(1, 0); 
        this.board.set(this.getHexKey(1, 0), this.startStation2);
        
        this.selectedTile = null; // 현재 플레이어가 선택하여 손에 들고 있는 타일
        this.dragOffset = { x: 0, y: 0 }; // 드래그 시 마우스와 타일 중심의 상대적 위치
        this.currentMousePos = { x: 0, y: 0 }; // 현재 마우스 위치 (그리기용)

        this.game_over = false;
        this.winner = null; // 승자 (1, 2, 또는 0=무승부/미정)
        this.impossible_declared = false; // '불가능'이 선언되었는지 여부
        this.impossible_declarer = null; // '불가능'을 선언한 플레이어
        this.messageDisplayed = false; // 메시지가 현재 표시 중인지 여부

        this.attachEventListeners();
        this.startNewTurn(); // 첫 턴 시작
    }

    // 게임 상태를 초기화하고 새로운 게임을 시작
    restartGame() {
        this.board.clear();
        this.currentPlayer = 1;
        this.placedTilesThisTurn = 0;
        this.totalPlacedTiles = 0;
        this.game_over = false;
        this.winner = null;
        this.impossible_declared = false;
        this.impossible_declarer = null;
        this.selectedTile = null;
        this.messageDisplayed = false;
        
        // 시작 기차역 타일 다시 배치
        this.startStation1 = new Tile(TILE_180, 0); 
        this.startStation1.setPosition(0, 0); 
        this.board.set(this.getHexKey(0, 0), this.startStation1);

        this.startStation2 = new Tile(TILE_180, 0); 
        this.startStation2.setPosition(1, 0); 
        this.board.set(this.getHexKey(1, 0), this.startStation2);

        this.hideMessage();
        console.log("게임이 재시작되었습니다.");
        this.startNewTurn();
    }

    // 육각형 좌표를 Map의 키로 사용할 문자열 생성
    getHexKey(q, r) {
        return `${q},${r}`; 
    }

    // 새로운 턴 시작
    startNewTurn() {
        this.placedTilesThisTurn = 0; //
        this.selectedTile = null; //
        
        // '불가능'이 선언된 상태라면, 타일 선택 버튼 활성화/비활성화 로직을 다르게 적용
        if (this.impossible_declared) { //
            this.enableTileSelectionButtonsForImpossible(); //
        } else {
            this.enableTileSelectionButtons(); //
        }

        this.updateUI(); //
        this.drawBoard(); //

        // 모든 타일이 놓였는지 확인하여 게임 종료 (회로 발견 못했을 경우)
        if (this.totalPlacedTiles >= this.maxPlayerPlaceableTiles && !this.game_over) { //
            this.game_over = true; //
            this.winner = 0; // 무승부 또는 점수 계산 필요 (여기서는 간단히 처리) //
            this.showMessage(`모든 타일(${this.maxPlayerPlaceableTiles}개)이 놓였습니다! 승자를 결정하세요.`, true); //
        }
    }

    // 게임 보드 및 타일 그리기
    drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = COLORS.WHITE;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const centerX = SCREEN_WIDTH / 2;
        const centerY = SCREEN_HEIGHT / 2;

        // 보드 중앙을 기준으로 렌더링할 그리드 범위 설정 (충분히 넓게)
        const renderRange = Math.max(
            Math.ceil(SCREEN_WIDTH / (HEX_RADIUS * 1.5)),
            Math.ceil(SCREEN_HEIGHT / (HEX_RADIUS * Math.sqrt(3)))
        ) + 2;

        for (let q = -renderRange; q <= renderRange; q++) {
            for (let r = -renderRange; r <= renderRange; r++) {
                // 육각형 그리드 그리기 (빈 공간 포함)
                const { x, y } = this.getScreenCoords(q, r);
                const corners = getHexCorners(x, y); 
                ctx.strokeStyle = COLORS.GRAY;
                ctx.lineWidth = 1;
                ctx.beginPath();
                corners.forEach((p, i) => { 
                    if (i === 0) ctx.moveTo(p.x, p.y); 
                    else ctx.lineTo(p.x, p.y);       
                });
                ctx.closePath();                     
                ctx.stroke();                        
            }
        }

        // 보드에 놓인 타일 그리기
        this.board.forEach(tile => {
            const { x, y } = this.getScreenCoords(tile.q, tile.r);
            tile.draw(ctx, x, y, false); 
        });
            
        // 선택되어 손에 들고 있는 타일 그리기
        if (this.selectedTile && !this.selectedTile.placed) {
            // 현재 마우스 위치와 드래그 오프셋을 더해 타일의 중심 위치를 계산
            const drawX = this.currentMousePos.x + this.dragOffset.x;
            const drawY = this.currentMousePos.y + this.dragOffset.y;
            this.selectedTile.draw(ctx, drawX, drawY, true); 
        }
    }

    // 육각형 큐브 좌표를 화면 픽셀 좌표로 변환 (캔버스 중앙 기준)
    getScreenCoords(q, r) {
        const centerX = SCREEN_WIDTH / 2;
        const centerY = SCREEN_HEIGHT / 2;
        
        const { x: xOffset, y: yOffset } = hexToPixel(q, r, HEX_RADIUS); 
        return { x: centerX + xOffset, y: centerY + yOffset };
    }

    // 화면 픽셀 좌표를 육각형 큐브 좌표로 변환 (캔버스 중앙 기준)
    getHexCoordsFromPixel(pixelX, pixelY) {
        const centerX = SCREEN_WIDTH / 2;
        const centerY = SCREEN_HEIGHT / 2;
        
        const adjustedX = pixelX - centerX;
        const adjustedY = pixelY - centerY;
        
        return pixelToHex(adjustedX, adjustedY, HEX_RADIUS); 
    }

    // UI 요소 업데이트
    updateUI() {
        currentPlayerText.textContent = `현재 플레이어: P${this.currentPlayer}`;
        
        // '불가능' 선언 상태에 따라 턴 배치 텍스트 변경
        if (this.impossible_declared) { //
            turnTilesText.textContent = `턴 배치: 무제한 (회로 완성 시까지)`; //
        } else {
            turnTilesText.textContent = `턴 배치: ${this.placedTilesThisTurn}/3`; //
        }
        
        totalPlacedTilesText.textContent = `총 놓인 타일: ${this.totalPlacedTiles}/${this.maxPlayerPlaceableTiles}`;

        if (this.selectedTile && !this.selectedTile.placed) {
            selectedTileInfo.textContent = `타일 종류: ${this.selectedTile.tileType}° (캔버스에 드래그하여 배치)`;
            rotationInfo.textContent = `회전: ${this.selectedTile.rotation}°`;
        } else {
            selectedTileInfo.textContent = "타일을 선택하세요 (아래 버튼)";
            rotationInfo.textContent = "";
        }
            
        rotateButton.disabled = !this.selectedTile || this.selectedTile.placed || this.game_over;
        // '불가능' 선언 시에는 최소 타일 배치 조건 없이 턴 종료 가능 (바로 회로 확인으로 넘어가므로)
        endTurnButton.disabled = this.game_over || (this.placedTilesThisTurn === 0 && !this.impossible_declared); //
        declareImpossibleButton.disabled = this.impossible_declared || this.game_over;

        // 타일 선택 버튼 활성화/비활성화 로직
        if (this.game_over || this.totalPlacedTiles >= this.maxPlayerPlaceableTiles || this.selectedTile !== null) { //
            this.disableTileSelectionButtons(); //
        } else if (this.impossible_declared) { //
            this.enableTileSelectionButtonsForImpossible(); //
        }
        else {
            if (this.placedTilesThisTurn >= 3) { //
                this.disableTileSelectionButtons(); //
            } else {
                this.enableTileSelectionButtons(); //
            }
        }
    }

    enableTileSelectionButtons() {
        select60TileButton.disabled = false;
        select120TileButton.disabled = false;
        select180TileButton.disabled = false;

        // 버튼 강조 초기화
        select60TileButton.classList.remove('selected');
        select120TileButton.classList.remove('selected');
        select180TileButton.classList.remove('selected');
    }

    // '불가능' 선언 시 타일 선택 버튼 활성화 로직 (3개 제한 없음)
    enableTileSelectionButtonsForImpossible() { //
        select60TileButton.disabled = false; //
        select120TileButton.disabled = false; //
        select180TileButton.disabled = false; //

        // 버튼 강조 초기화
        select60TileButton.classList.remove('selected'); //
        select120TileButton.classList.remove('selected'); //
        select180TileButton.classList.remove('selected'); //
    }

    disableTileSelectionButtons() {
        select60TileButton.disabled = true;
        select120TileButton.disabled = true;
        select180TileButton.disabled = true;
    }

    // 게임 메시지 오버레이 표시
    showMessage(message, showRestartButton = false) {
        messageContent.innerHTML = message;
        messageOverlay.classList.remove('hidden');
        this.messageDisplayed = true;

        if (showRestartButton) {
            restartGameButton.classList.remove('hidden');
            closeMessageButton.classList.add('hidden'); 
        } else {
            restartGameButton.classList.add('hidden');
            closeMessageButton.classList.remove('hidden'); 
        }
    }

    // 게임 메시지 오버레이 숨기기
    hideMessage() {
        messageOverlay.classList.add('hidden');
        this.messageDisplayed = false;
        restartGameButton.classList.add('hidden');
        closeMessageButton.classList.remove('hidden');
    }

    // 모든 이벤트 리스너 부착
    attachEventListeners() {
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));

        select60TileButton.addEventListener('click', () => this.selectTileToPlace(TILE_60, select60TileButton));
        select120TileButton.addEventListener('click', () => this.selectTileToPlace(TILE_120, select120TileButton));
        select180TileButton.addEventListener('click', () => this.selectTileToPlace(TILE_180, select180TileButton));

        rotateButton.addEventListener('click', () => {
            if (this.selectedTile && !this.selectedTile.placed && !this.game_over) {
                this.selectedTile.rotate();
                this.updateUI();
                this.drawBoard();
            }
        });

        endTurnButton.addEventListener('click', this.endTurn.bind(this));
        declareImpossibleButton.addEventListener('click', this.declareImpossible.bind(this));

        closeMessageButton.addEventListener('click', this.hideMessage.bind(this));
        restartGameButton.addEventListener('click', this.restartGame.bind(this));

        document.addEventListener('keydown', (event) => {
            if (this.game_over || this.messageDisplayed) return; // 메시지 표시 중에는 키 입력 무시

            if (event.code === 'Space') { 
                this.endTurn();
            } else if (event.code === 'KeyR') { 
                if (this.selectedTile && !this.selectedTile.placed) {
                    this.selectedTile.rotate();
                    this.updateUI();
                    this.drawBoard();
                }
            } else if (event.code === 'KeyF') { 
                if (!this.impossible_declared) {
                    this.declareImpossible();
                }
            }
        });
    }

    selectTileToPlace(tileType, buttonElement) {
        if (this.game_over) return;
        
        if (this.totalPlacedTiles >= this.maxPlayerPlaceableTiles) {
            this.showMessage(`더 이상 타일을 놓을 수 없습니다! 총 ${this.maxPlayerPlaceableTiles}개 제한.`);
            this.disableTileSelectionButtons();
            return;
        }
        // '불가능' 선언 상태가 아닐 때만 3개 타일 제한 적용
        if (!this.impossible_declared && this.placedTilesThisTurn >= 3) { //
            this.showMessage("이번 턴에 놓을 수 있는 타일을 모두 배치했습니다. 턴을 종료하세요.");
            this.disableTileSelectionButtons(); 
            return;
        }
        if (this.selectedTile && !this.selectedTile.placed) {
            this.showMessage("이미 손에 타일이 있습니다. 현재 타일을 배치하거나 턴을 종료하세요.");
            return;
        }

        this.selectedTile = new Tile(tileType);
        
        // 모든 버튼의 'selected' 클래스 제거
        [select60TileButton, select120TileButton, select180TileButton].forEach(btn => {
            btn.classList.remove('selected');
        });
        // 현재 선택된 버튼에 'selected' 클래스 추가
        if (buttonElement) { 
            buttonElement.classList.add('selected');
        }

        this.disableTileSelectionButtons(); // 타일 선택 후에는 다른 타일 선택 비활성화

        this.updateUI();
        this.drawBoard();
    }

    handleMouseDown(event) {
        if (this.game_over || this.messageDisplayed) return;

        const mouseX = event.offsetX;
        const mouseY = event.offsetY;
        
        if (event.button === 0) { // 좌클릭
            if (this.selectedTile && !this.selectedTile.placed) {
                // 드래그 시작 시 마우스와 타일 중심 간의 상대적 위치 저장
                // 마우스가 클릭된 픽셀 위치를 육각형 좌표로 변환 후 다시 픽셀로 변환하여 육각형의 중심을 찾음
                const { q, r } = this.getHexCoordsFromPixel(mouseX, mouseY);
                const { x, y } = this.getScreenCoords(q, r);
                this.dragOffset.x = x - mouseX;
                this.dragOffset.y = y - mouseY;
            } else {
                this.showMessage("먼저 '타일 선택' 버튼 중 하나를 클릭하여 타일을 손에 드세요.");
            }
        }
    }

    handleMouseMove(event) {
        if (this.game_over || this.messageDisplayed) return;
        this.currentMousePos = { x: event.offsetX, y: event.offsetY };
        if (this.selectedTile && !this.selectedTile.placed) {
            this.drawBoard(); // 드래그 중인 타일을 계속 업데이트하여 그리기
        }
    }

    handleMouseUp(event) {
        if (this.game_over || this.messageDisplayed) return;
        if (event.button === 0) { // 좌클릭 떼기
            if (this.selectedTile && !this.selectedTile.placed) {
                const mouseX = event.offsetX;
                const mouseY = event.offsetY;
                const targetHex = this.getHexCoordsFromPixel(mouseX, mouseY); // 놓으려는 육각형 좌표

                // 타일 배치 가능 여부 확인
                if (this.canPlaceTile(this.selectedTile, targetHex.q, targetHex.r)) { 
                    this.placeTile(this.selectedTile, targetHex.q, targetHex.r); 
                    this.placedTilesThisTurn++; 
                    this.totalPlacedTiles++; 
                    
                    this.selectedTile = null; // 타일 배치 후 선택 해제
                    
                    // '불가능' 선언 상태가 아닐 때만 3개 제한 검사
                    if (!this.impossible_declared) { //
                        this.enableTileSelectionButtons(); // 다음 타일 선택 활성화
                        if (this.placedTilesThisTurn >= 3 || this.totalPlacedTiles >= this.maxPlayerPlaceableTiles) { //
                            this.endTurn(); 
                        } else {
                            this.updateUI(); 
                            this.drawBoard(); // UI 업데이트 후 보드 다시 그리기
                        }
                    } else {
                        // '불가능' 선언 상태일 때는 3개 제한 없이 계속 배치 가능
                        this.enableTileSelectionButtonsForImpossible(); //
                        this.updateUI(); 
                        this.drawBoard();
                        // 이 상태에서는 턴 종료를 명시적으로 눌러야 회로 체크
                    }
                } else {
                    console.log(`타일을 (${targetHex.q}, ${targetR})에 놓을 수 없습니다.`);
                    // 타일 배치 실패 시 시각적으로 손에 들고 있도록 다시 그립니다.
                    this.drawBoard(); 
                }
            }
        }
    }
    
    canPlaceTile(tile, targetQ, targetR) {
        // 게임 종료 상태일 경우 배치 불가
        if (this.game_over) {
            this.showMessage("게임이 종료되어 더 이상 타일을 놓을 수 없습니다.");
            return false;
        }
        // 최대 타일 개수 제한 확인
        if (this.totalPlacedTiles >= this.maxPlayerPlaceableTiles) {
            this.showMessage("최대 타일 개수 제한에 도달하여 더 이상 타일을 놓을 수 없습니다.");
            return false;
        }

        const targetKey = this.getHexKey(targetQ, targetR);
        // 이미 타일이 있는 곳에 배치 불가
        if (this.board.has(targetKey)) {
            console.log(`(${targetQ}, ${targetR})에 이미 타일이 있습니다.`);
            this.showMessage(`(${targetQ}, ${targetR})에 이미 타일이 있습니다.`);
            return false;
        }

        // 육각형 보드의 가장자리에서 벗어나는 위치에 놓지 않도록 제한
        const boardLimit = 5; // 보드의 가상 경계, 필요에 따라 조절
        if (Math.abs(targetQ) > boardLimit || Math.abs(targetR) > boardLimit || Math.abs(targetQ + targetR) > boardLimit) {
            this.showMessage("이 위치에는 보드 경계를 벗어나서 타일을 놓을 수 없습니다.");
            return false;
        }

        // 인접한 타일이 있어야만 배치 가능 (시작 타일은 예외)
        let hasNeighbor = false;
        // 새로 놓을 타일이 시작역 타일 (0,0) 또는 (1,0)과 인접한지 확인
        // 또는 이미 보드에 놓인 다른 일반 타일과 인접한지 확인
        for (let i = 0; i < 6; i++) {
            const { q: nq, r: nr } = getNeighborHex(targetQ, targetR, i); 
            if (this.board.has(this.getHexKey(nq, nr))) {
                hasNeighbor = true;
                break;
            }
        }
        if (!hasNeighbor) {
            // 시작역 타일이 이미 존재하므로, 그 외의 인접 타일이 반드시 있어야 함.
            if (!(targetQ === 0 && targetR === 0) && !(targetQ === 1 && targetR === 0)) { // 시작역 위치가 아닌 경우
                 this.showMessage(`(${targetQ}, ${targetR}) 주변에 인접한 타일이 있어야 합니다.`);
                 return false;
            }
        }

        // Railroad Ink 규칙: 턴에 놓는 타일들의 연결성 (3개까지)
        // '불가능'이 선언된 상태가 아닐 때만 이 규칙 적용
        if (!this.impossible_declared && this.placedTilesThisTurn > 0) { //
            const currentTurnTilesCoords = [];
            this.board.forEach(boardTile => {
                // 이번 턴에 새로 놓인 타일만 추적
                if (boardTile.placedThisTurn) { 
                    currentTurnTilesCoords.push({ q: boardTile.q, r: boardTile.r });
                }
            });
            
            // 현재 놓으려는 타일을 포함한 '이번 턴'의 타일 목록 (임시)
            const proposedCoords = [...currentTurnTilesCoords, { q: targetQ, r: targetR }];

            if (proposedCoords.length === 2) {
                // 2개째 타일: 이전(1개) 타일에 인접해야 함
                const [p1] = currentTurnTilesCoords; // 이미 놓인 첫 번째 타일
                const p2 = { q: targetQ, r: targetR }; // 새로 놓을 두 번째 타일

                let isAdjacent = false;
                for (let i = 0; i < 6; i++) {
                    const { q: nq, r: nr } = getNeighborHex(p1.q, p1.r, i); 
                    if (nq === p2.q && nr === p2.r) {
                        isAdjacent = true;
                        break;
                    }
                }
                if (!isAdjacent) {
                    this.showMessage("2개째 타일은 이번 턴에 놓은 이전 타일에 인접하게 놓아야 합니다.");
                    return false;
                }
            } else if (proposedCoords.length === 3) {
    		// --- 1) 기존 인접성 검사 유지 ---
    		const [p1, p2] = currentTurnTilesCoords;
    		const p3 = { q: targetQ, r: targetR };
		let adj1 = false, adj2 = false;
		for (let i = 0; i < 6; i++) {
        	    const n1 = getNeighborHex(p1.q, p1.r, i);
        	    if (n1.q === p3.q && n1.r === p3.r) { adj1 = true; }
        	    const n2 = getNeighborHex(p2.q, p2.r, i);
		    if (n2.q === p3.q && n2.r === p3.r) { adj2 = true; }
    		}
    		if (!(adj1 || adj2)) {
        		this.showMessage("3개째 타일은 이번 턴에 놓은 이전 타일 중 하나에 인접해야 합니다.");
        		return false;
    		}

    		// --- 2) 새로 놓는 3개가 같은 직선상(공선)인지 검사 ---
    		const [a, b] = currentTurnTilesCoords;
    		const c = p3;
		const sumA = a.q + a.r;
    		const sumB = b.q + b.r;
    		const sumC = c.q + c.r;

    		const sameQ   = (a.q === b.q && b.q === c.q);
    		const sameR   = (a.r === b.r && b.r === c.r);
    		const sameSum = (sumA === sumB && sumB === sumC);

    		if (!(sameQ || sameR || sameSum)) {
        		this.showMessage("3개의 타일은 같은 직선상에 배치되어야 합니다.");
        		return false;
    		}
	    }
        }
        return true; // 모든 조건을 통과하면 배치 가능
    }

    placeTile(tile, q, r) {
        tile.setPosition(q, r); 
        this.board.set(this.getHexKey(q, r), tile); 
        tile.placedThisTurn = true; // 이번 턴에 놓인 타일로 표시
        console.log(`P${this.currentPlayer}가 (${q}, ${r})에 ${tile.tileType}° 타일을 놓았습니다.`);
    }

    // 완전한 회로를 감지하는 핵심 DFS 함수
    findCircuit(startQ, startR, startPortIndex, maxDepth = 50) {
        // visited: Map<string, Set<number>> -> key: "q,r", value: Set of visited global port indexes
        // 방문한 타일의 특정 포트를 통해 들어온 경로를 기록하여 무한 루프와 중복 탐색을 방지합니다.
        const visited = new Map(); 

        // 스택에 초기 상태 추가: { 현재 타일 q, 현재 타일 r, 현재 타일로 들어온 전역 포트, 현재까지의 경로 길이 }
        const stack = [{ q: startQ, r: startR, entryPort: startPortIndex, pathLength: 0 }];

        while (stack.length > 0) {
            const { q, r, entryPort, pathLength } = stack.pop();
            const currentTile = this.board.get(this.getHexKey(q, r));

            if (!currentTile) continue; // 보드에 없는 타일이면 건너뛰기

            const pathKey = this.getHexKey(q, r);
            if (!visited.has(pathKey)) {
                visited.set(pathKey, new Set());
            }
            
            // 현재 타일의 '진입 포트'가 이미 '탐색 경로의 일부'로 방문되었는지 확인
            // 이 조건은 사이클을 감지하는 핵심입니다.
            if (visited.get(pathKey).has(entryPort)) {
                // 시작점과 동일한 타일의 동일한 포트로 돌아왔고, 경로 길이가 0보다 크면 유효한 회로
                if (q === startQ && r === startR && entryPort === startPortIndex && pathLength > 0) {
                    console.log(`[CIRCUIT FOUND] From (${startQ}, ${startR}) port ${startPortIndex} -> Completed at (${q}, ${r}) port ${entryPort}. Path Length: ${pathLength}`);
                    return true; 
                }
                // 이미 방문한 포트이므로 더 이상 이 경로로 탐색하지 않음 (무한 루프 방지)
                continue; 
            }
            // 현재 포트를 방문 처리
            visited.get(pathKey).add(entryPort);

            if (pathLength >= maxDepth) continue; // 무한 루프 방지, 너무 긴 경로 방지

            const currentTileConnections = currentTile.getCurrentLocalConnections(); // 이 연결들은 이미 회전 반영됨.

            for (const [p1_rotated_global, p2_rotated_global] of currentTileConnections) {
                let exitPort_global = -1; // 다음 타일로 나갈 전역 포트 인덱스

                // 들어온 포트(entryPort, 전역 인덱스)와 연결된 반대편 포트를 찾습니다.
                // p1_rotated_global과 p2_rotated_global은 이미 회전이 반영된 '전역 포트 인덱스'와 동일합니다.
                if (p1_rotated_global === entryPort) {
                    exitPort_global = p2_rotated_global;
                } else if (p2_rotated_global === entryPort) {
                    exitPort_global = p1_rotated_global;
                }
                
                if (exitPort_global !== -1) {
                    // 나가는 포트의 방향에 해당하는 다음 육각형 좌표를 얻음
                    const { q: nextQ, r: nextR } = getNeighborHex(q, r, exitPort_global);
                    const nextTile = this.board.get(this.getHexKey(nextQ, nextR));

                    if (nextTile) {
                        // 다음 타일로 들어가는 포트 인덱스는 현재 타일에서 나가는 포트 인덱스의 반대 방향 (전역 기준)
                        const nextEntryPort_global = (exitPort_global + 3) % 6; 
                        
                        stack.push({ 
                            q: nextQ, 
                            r: nextR, 
                            entryPort: nextEntryPort_global, 
                            pathLength: pathLength + 1
                        });
                    }
                }
            }
        }
        return false; // 회로를 찾지 못함
    }

    // 승리 조건 확인 (완전한 회로 감지)
      // --- 추가할 부분: 모든 타일이 하나의 궤도망으로 연결되어 있는지 검사 ---
    isFullyConnected() {
        const firstKey = this.board.keys().next().value;
        const [startQ, startR] = firstKey.split(',').map(Number);
 
        const visited = new Set();
        const stack = [[startQ, startR]];
 
        while (stack.length) {
            const [q, r] = stack.pop();
            const key = `${q},${r}`;
            if (visited.has(key)) continue;
            visited.add(key);
 
            const tile = this.board.get(key);
            for (const [p1, p2] of tile.getCurrentLocalConnections()) {
                for (const port of [p1, p2]) {
                    const { q: nq, r: nr } = getNeighborHex(q, r, port);
                    const nKey = `${nq},${nr}`;
                    if (this.board.has(nKey) && !visited.has(nKey)) {
                        stack.push([nq, nr]);
                    }
                }
            }
        }
 
        return visited.size === this.board.size;
    }
 
    // --- 추가할 부분: Game 클래스 내 헬퍼 함수 ---
    // 모든 타일이 하나의 궤도망으로 연결되어 있는지 검사
    isFullyConnected() {
        const firstKey = this.board.keys().next().value;
        const [startQ, startR] = firstKey.split(',').map(Number);

        const visited = new Set();
        const stack = [[startQ, startR]];

        while (stack.length) {
            const [q, r] = stack.pop();
            const key = `${q},${r}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const tile = this.board.get(key);
            for (const [p1, p2] of tile.getCurrentLocalConnections()) {
                for (const port of [p1, p2]) {
                    const { q: nq, r: nr } = getNeighborHex(q, r, port);
                    const nKey = `${nq},${nr}`;
                    if (this.board.has(nKey) && !visited.has(nKey)) {
                        stack.push([nq, nr]);
                    }
                }
            }
        }

        return visited.size === this.board.size;
    }

    checkWinCondition() {
        // 1) 모든 타일이 하나의 궤도망에 연결되어 있는지 먼저 검사
        if (!this.isFullyConnected()) {
            console.log("아직 모든 타일이 하나의 궤도로 연결되지 않았습니다.");
            return false;
        }

        // 2) 기존 사이클 검사 로직
        for (const tileKey of this.board.keys()) {
            const [q, r] = tileKey.split(',').map(Number);
            const tile = this.board.get(tileKey);
            for (const [portA, portB] of tile.getCurrentLocalConnections()) {
                if (this.findCircuit(q, r, portA) || this.findCircuit(q, r, portB)) {
                    console.log(`승리 조건 달성! 회로가 (${q}, ${r})의 포트에서 발견되었습니다.`);
                    return true;
                }
            }
        }

        console.log("아직 회로가 발견되지 않았습니다.");
        return false;
    }

    
    // '불가능' 선언 처리 함수
    declareImpossible() { //
        if (this.game_over) { //
            this.showMessage("게임이 이미 종료되었습니다."); //
            return; //
        }

        this.impossible_declared = true; //
        this.impossible_declarer = this.currentPlayer; //
        this.showMessage(`P${this.impossible_declarer}가 '불가능'을 선언했습니다! P${3-this.impossible_declarer}에게 기회가 주어집니다!`, false); //
        
        this.selectedTile = null; //
        this.placedTilesThisTurn = 0; // '불가능' 선언 턴은 타일 배치 횟수 초기화 //

        this.currentPlayer = 3 - this.currentPlayer; // 상대방에게 턴 넘김 //
        this.startNewTurn(); //
    }

    // '불가능' 선언 이후 도전자의 턴이 끝났을 때 승패를 결정하는 함수
    checkImpossibleWin() { //
        // '불가능'을 선언당한 플레이어가 턴을 진행한 후 호출됨
        if (this.checkWinCondition()) { //
            this.winner = this.currentPlayer; // 회로를 완성했으므로 현재 플레이어(도전자) 승리 //
            this.game_over = true; //
            this.showMessage(`P${this.currentPlayer}가 회로를 완성했습니다! P${this.currentPlayer} 승리! 게임 재시작`, true); //
        } else {
            this.winner = this.impossible_declarer; // 회로를 완성하지 못했으므로 '불가능' 선언자 승리 //
            this.game_over = true; //
            this.showMessage(`P${this.currentPlayer}가 회로를 완성하지 못했습니다. P${this.impossible_declarer} 승리! 게임 재시작`, true); //
        }
        this.updateUI(); //
        this.drawBoard(); //
    }

    // 턴 종료
    endTurn() {
        if (this.game_over) {
            console.log("게임이 이미 종료 상태입니다. 턴 종료 스킵.");
            return;
        }

        // '불가능' 선언 상태가 아닐 때만 최소 1개 타일 배치 조건 적용
        if (!this.impossible_declared && this.placedTilesThisTurn === 0) { //
            this.showMessage("이번 턴에는 최소한 1개의 타일을 배치해야 합니다!"); //
            return; //
        }

        // 이번 턴에 놓인 타일의 placedThisTurn 플래그 초기화
        this.board.forEach(tile => {
            tile.placedThisTurn = false;
        });

        // 손에 들고 있던 타일이 있다면 버림
        if (this.selectedTile && !this.selectedTile.placed) {
            console.log("손에 들고 있던 타일을 버렸습니다.");
            this.selectedTile = null;
        }

        if (this.impossible_declared) { //
            // '불가능'이 선언된 상태라면, 현재 플레이어의 결과를 바탕으로 승자 결정
            this.checkImpossibleWin(); //
        } else {
            // 일반 턴 종료 시 승리 조건 확인
            if (this.checkWinCondition()) {
                this.winner = this.currentPlayer;
                this.game_over = true;
                this.showMessage(`축하합니다! P${this.currentPlayer}가 철로를 완성했습니다! 승리! 게임 재시작`, true);
            } else {
                // 승리 조건 미달성 시 다음 플레이어로 턴 넘김
                this.currentPlayer = 3 - this.currentPlayer;
                this.startNewTurn(); 
                console.log(`턴 종료. 다음 플레이어: P${this.currentPlayer}`);
            }
        }
        this.updateUI(); 
        this.drawBoard();
    }
}

// 게임 시작
let game = new Game();
