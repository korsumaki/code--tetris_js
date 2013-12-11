"use strict";

/*

Javascriptillä toteutettu code::tetris.
Tetris palikoiden liikkeet ohjelmoidaan javascriptillä.
Annetaan palikoiden pudota ja katsotaan miten niiden koodi toimii.

-------------
ideoita:
- native applikaatio minkä sisällä browser komponentti ajaa javascriptiä?
- php sivu antaa jonkun random koodin mikä estää palikkakoodin puuttumisen frameworkin muuttujiin.
-------------
- koodin suoritusta kellotetaan, esim. 1 funktiokutsu = 1 cpu cycle
    - palikka putoaa tietyn cycle määrän välein, 10-9-8-7...
    - move ja rotate, 1 step=1 cycle
- joku havainnollinen tapa esittää mihin koodin suoritusaika menee
- tarvitaan jonkunlainen esto sorkkia framework koodia ja muuttujia palikoiden koodista
    - voiko palikoiden koodin laittaa worker threadiin?
- pitäisi olla joku selkeä juttu missä vaiheessa koodataan mitäkin palikkaa, ja missä vaiheessa annetaan palikoiden pudota

-------------
Mitä käyttäjä saa pelin edetessä?
- monimutkaisempia palikoita -> lisää koodattavaa
- ultimate palikka: randomilla generoitu max 4x4 palikka jonka muoto täytyy päätellä lennossa

Pisteillä ostettavat ominaisuudet:
- lisää "cpu" aikaa, dualcore, quadcore
    - multicoren hallinta vaatii kuitenkin erilaista koodia
- uusia tehokkaampia käskyjä, mitä?
    - cache: keino pitää muistissa dataa -> esim. näkee vähemmillä käskyillä pelikentän tilanteen
        - cache::save/load(struct) // 1 cycle
        - näkyy yhteisesti kaikille palikoille
- kirjaston tekomahdollisuus
- enemmän tilaa koodille (rivi tai merkkimäärä rajoitettu)?


 * 
 * + minimization: http://closure-compiler.appspot.com/home
 * 
 * TODO list:
 * + blockien muodot
 * + isRoomForBlock koodaus
 * + rotate
 * + animointi 
 *   + move
 *   + rotate
 *   + nopeus 3* putoamisen oletusnopeus
 *   + palikan piirtäminen joka stepillä
 * + koodi suoritetaan palikan pudotuksessa
 *   + aluksi vain yksi koodi
 * - eri palikoille omat koodit
 * 
 * - BUG: drop ei saa hidastua seinään osuessa
 * - BUG: pelkkä drop() ei toimi?
 * 
 * /- viive ennen pudotusta?
 * 
 * - koodit tallennetaan localstorageen
 * - restart nappi?
 * - yhtenäisen rivin poistaminen + pisteiden lisääminen
 * - pelin nopeutuminen (20 palikkaa++)
 * 
 * - ruudun skaalaus eri näytöille
 * 
 * Nice to have:
 * - pehmeä animaatio (rotate, move, drop)
 */

var logText="";


function log(str)
{
	logText += str + "<br>";
	document.getElementById("logWindow").innerHTML=logText;
}

function error(str)
{
	log("ERROR: " + str);
}

//-------------------------------------

var PLAYFIELD_WALL_SIZE = 1;
var PLAYFIELD_TOTAL_SIZE_X = 20;
var PLAYFIELD_SIZE_X = PLAYFIELD_TOTAL_SIZE_X-2*PLAYFIELD_WALL_SIZE;
var PLAYFIELD_SIZE_Y = 40;
var BLOCK_SIZE=20;
var PLAYFIELD_EMPTY_CELL="LightGray";
var PLAYFIELD_WALL = "Gray";
var UNDEFINED_COLOR = "black";

var SET_BOX_MARK = 'x';
var DEFAULT_SPEED = 200;
var MOVEMENT_SPEED = DEFAULT_SPEED/3;

var currentSpeed = DEFAULT_SPEED;
var playFieldArray; // 2D Array for storing playfield cell colors
var blockArray;		// Array of blocks
var currentBlock;
var moveQueue;

var codeForBlocks = function() {};

var BLOCK_A = 
	"----"+
	"----"+
	"xxxx"+
	"----";

var BLOCK_B1 = 
	"x--"+
	"xxx"+
	"---";

var BLOCK_B2 = 
	"--x"+
	"xxx"+
	"---";

var BLOCK_C = 
	"xx"+
	"xx";

var BLOCK_D1 = 
	"---"+
	"-xx"+
	"xx-";

var BLOCK_E = 
	"-x-"+
	"xxx"+
	"---";


var BLOCK_D2 = 
	"---"+
	"xx-"+
	"-xx";





function Block(name, shapeData, col) {
	this.name = name;
	this.code = "// Write your javascript for " + name;
	this.shapeData = shapeData;
	this.color = col;
	this.rotate = 0;
	this.futureRotate = this.rotate; // This is used to keep track to which position block is rotating after queue commands are executed.
	this.x = PLAYFIELD_SIZE_X/2;
	this.futureX = this.x; // This is used to keep track to which column block is moving after queue commands are executed.
	this.y = this.getShapeSize();
}

Block.prototype.getShapeSize = function () {
	if (this.shapeData.length === 4) {
		return 2;
	}
	else if (this.shapeData.length === 9) {
		return 3;
	}
	else if (this.shapeData.length === 16) {
		return 4;
	}
	return 5;
};

Block.prototype.getOffsetX = function () {
	var size = this.getShapeSize();
	
	for (var y=size-1; y>=0; --y)
	{
		for (var x=0; x<size; ++x)
		{
			if (this.isBoxSet(x, y))
			{
				return -x;
			}
		}
	}
	error("getOffsetX: not found.");
	return 0;
};

Block.prototype.getOffsetY = function () {
	return -this.getShapeSize();
};



Block.prototype.isBoxSet = function (x, y)
{
	var size = this.getShapeSize();
	var rx=0;
	var ry=0;

	switch (this.rotate)
	{
		case 0:
			rx=x;
			ry=y;
			break;
		case 1:
			rx=size-y-1;
			ry=x;
			break;
		case 2:
			rx=size-x-1;
			ry=size-y-1;
			break;
		case 3:
		default:
			rx=y;
			ry=size-x-1;
			break;
	}
	
	if (this.shapeData[rx+size*ry] == SET_BOX_MARK)
	{
		return true;
	}
	return false;
};

Block.prototype.draw = function() {
	var size = this.getShapeSize();
	var bx = this.getOffsetX();
	var by = this.getOffsetY();
	
	for (var x=0; x<size; ++x)
	{
		for (var y=0; y<size; ++y)
		{
			if (this.isBoxSet(x, y))
			{
				drawBoxAbs((this.x + x + bx + PLAYFIELD_WALL_SIZE), (this.y + y + by), this.color);
			}
		}
	}
};


Block.prototype.run = function() {
	//log("run!");
	codeForBlocks();
};


function getFieldCellAbs(x, y)
{
	if ((x > PLAYFIELD_TOTAL_SIZE_X-1) || (x<0))
	{
		error("getFieldCellAbs: x ouf of field ");
		return UNDEFINED_COLOR;
	}
	if ((y > PLAYFIELD_SIZE_Y-1) || (y<0))
	{
		error("getFieldCellAbs: y ouf of field");
		return UNDEFINED_COLOR;
	}

	var col=playFieldArray[x][y];
	if (col===undefined) 
	{
		return UNDEFINED_COLOR;
	}
	return col;
}

function setFieldCellAbs(x, y, col)
{
	//log("setFieldCellAbs(" + x + "," + y + "): " + col);
	if (x > PLAYFIELD_TOTAL_SIZE_X-1)
	{
		error("setFieldCellAbs: x too big");
		return;
	}
	if (y > PLAYFIELD_SIZE_Y-1)
	{
		error("setFieldCellAbs: y too big");
		return;
	}
	
	playFieldArray[x][y] = col;
}

// Initialize playfield (actual array, walls and background)
function initField()
{
	// Init array
	playFieldArray = new Array();
	for (var x=0; x<PLAYFIELD_TOTAL_SIZE_X; ++x)
	{
		playFieldArray.push(new Array());
	}
	
	// Background
	for (var x=1; x<PLAYFIELD_TOTAL_SIZE_X-1; ++x)
	{
		for (var y=0; y<PLAYFIELD_SIZE_Y-1; ++y)
		{
			setFieldCellAbs(x, y, PLAYFIELD_EMPTY_CELL);
		}
	}

	// Walls
	for (var y=0; y<PLAYFIELD_SIZE_Y; ++y)
	{
		setFieldCellAbs(0, y, PLAYFIELD_WALL);
		setFieldCellAbs(PLAYFIELD_TOTAL_SIZE_X-1, y, PLAYFIELD_WALL);
	}

	for (var x=0; x<PLAYFIELD_TOTAL_SIZE_X; ++x)
	{
		setFieldCellAbs(x, PLAYFIELD_SIZE_Y-1, PLAYFIELD_WALL);
	}
}

// Draw whole playfield with walls and stopped blocks
function drawField()
{
	for (var x=0; x<PLAYFIELD_TOTAL_SIZE_X; ++x)
	{
		for (var y=0; y<PLAYFIELD_SIZE_Y; ++y)
		{
			drawBoxAbs(x, y, getFieldCellAbs(x, y));
		}
	}

}

// Draw one box with absolute coordinates (=possibility to draw also walls)
function drawBoxAbs(x, y, color)
{
	var c=document.getElementById("playFieldCanvas");
	var ctx=c.getContext("2d");
	ctx.fillStyle=color;
	ctx.fillRect(x*BLOCK_SIZE,y*BLOCK_SIZE, BLOCK_SIZE-1, BLOCK_SIZE-1);
}


function MoveCommand(command, param) {
	this.command = command;
	this.param = param;
	//log("new MoveCommand( " + command + ", " +param+")");
}

MoveCommand.prototype.action = function () {
	//log("MoveCommand.action( " + this.command + ", " + this.param +")");
	switch (this.command)
	{
		case "move":
			var origVal = currentBlock.x;
			currentBlock.x = this.param;
			if (!isRoomForBlock(currentBlock))
			{
				//log("No room for move!");
				currentBlock.x = origVal;
				break;
			}
			// Remove from queue only if there was possibility to rotate.
			moveQueue.shift();
			break;
		case "rotate":
			//currentBlock.rotate = this.param;
			var origVal = currentBlock.rotate;
			currentBlock.rotate = this.param;
			if (!isRoomForBlock(currentBlock))
			{
				//log("No room for rotate!");
				currentBlock.rotate = origVal;
				break;
			}
			// Remove from queue only if there was possibility to move.
			moveQueue.shift();
			break;
		case "drop":
			currentSpeed = 20;
			moveQueue.shift();
			break;
		default:
			error("Unknown command: " + this.command);
	}
};

var moveQueueTimer;

function executeMoveQueue()
{
	if (moveQueue.length == 0)
	{
		log("executeMoveQueue: moveQueue.length == 0");
		moveQueueTimer=null;
		return;
	}
	// Use first action, but do not remove it yet from queue. It is done after successfull movement.
	moveQueue[0].action();
	if (moveQueue.length >= 1)
	{
		//log("new timer");
		moveQueueTimer = setTimeout(function(){ executeMoveQueue(); }, MOVEMENT_SPEED );
	}
	else
	{
		moveQueueTimer=null;
	}
	// Redraw field
	drawField();
	currentBlock.draw();

}


// ======================================= 
// API Methods
// ======================================= 


// Get width of playfield
function getWidth()
{
	return PLAYFIELD_SIZE_X;
}

// Rotate to position 'rot'
function rotate(rot)
{
	rot = Math.max(0,rot);
	rot = Math.min(3,rot);

	var r = currentBlock.rotate;
	var step=1;
	if (r>rot)
	{
		step=-1;
	}
	for (; r!=rot; r+=step)
	{
		moveQueue.push(new MoveCommand("rotate", r) );
	}
	
	moveQueue.push(new MoveCommand("rotate", rot) );
	if (moveQueueTimer==null)
	{
		moveQueueTimer = setTimeout(function(){ executeMoveQueue(); }, MOVEMENT_SPEED );
	}
}

// Move to column 'col'
function move(col)
{
	col = Math.max(0,col);
	col = Math.min(PLAYFIELD_SIZE_X,col);
	// Handle animation
	var x = currentBlock.futureX; // .x
	var step=1;
	if (x>col)
	{
		step=-1;
	}
	for (; x!=col; x+=step)
	{
		moveQueue.push(new MoveCommand("move", x) );
	}
	moveQueue.push(new MoveCommand("move", x) );
	currentBlock.futureX = x;
	if (moveQueueTimer==null)
	{
		moveQueueTimer = setTimeout(function(){ executeMoveQueue(); }, MOVEMENT_SPEED );
	}
}

// Get height of column 'col'
function getHeight(col)
{
	for (var y=0; y<PLAYFIELD_SIZE_Y; y++)
	{
		if (getFieldCellAbs(col+PLAYFIELD_WALL_SIZE, y) !== PLAYFIELD_EMPTY_CELL)
		{
			var height = PLAYFIELD_SIZE_Y - PLAYFIELD_WALL_SIZE - y;
			return height;
		}
	}
	error("getHeight()");
	return 0;
}

// Get column number of lowest column
function getLowestColumn()
{
	var lowestCol=99;
	var lowestHeight=99;
	for (var x=0; x<getWidth(); x++)
	{
		var h = getHeight(x);
		if (h<lowestHeight)
		{
			lowestHeight = h;
			lowestCol = x;
		}
	}
	return lowestCol;
}


// Drop block down
function drop()
{
	moveQueue.push(new MoveCommand("drop", 0) );
}

// =======================================


function onRunCodeButton()
{
	var code = $( "#codeWindow" ).val();
	try
	{
		var tempCode = new Function( code );
		// If previous line does not throw, lets store it.
		codeForBlocks = tempCode;
	}
	catch(err)
	{
		log( err );
	}
}


function createBlocks()
{
	blockArray = new Array();
	blockArray.push( new Block("Block A",  BLOCK_A,  "#00FFFF") );
	blockArray.push( new Block("Block B1", BLOCK_B1, "#0000FF") );
	blockArray.push( new Block("Block B2", BLOCK_B2, "#FF9900") );
	blockArray.push( new Block("Block C",  BLOCK_C,  "#FFFF00") );
	blockArray.push( new Block("Block D1", BLOCK_D1, "#00FF00") );
	blockArray.push( new Block("Block E",  BLOCK_E,  "#9900FF") );
	blockArray.push( new Block("Block D2", BLOCK_D2, "#FF0000") );

	/*blockArray.push( new Block("Block A",  BLOCK_A,  "#00f0ef") );
	blockArray.push( new Block("Block B1", BLOCK_B1, "#0000f0") );
	blockArray.push( new Block("Block B2", BLOCK_B2, "#f0a001") );
	blockArray.push( new Block("Block C",  BLOCK_C,  "#f1f000") );
	blockArray.push( new Block("Block D1", BLOCK_D1, "#01f000") );
	blockArray.push( new Block("Block E",  BLOCK_E,  "#9f00f0") );
	blockArray.push( new Block("Block D2", BLOCK_D2, "#f00001") );*/
}

function initCodeWindow()
{
	
}


function isRoomForBlock(block)
{
	var size = block.getShapeSize();
	var bx = block.getOffsetX();
	var by = block.getOffsetY();
	
	for (var x=0; x<size; ++x)
	{
		for (var y=0; y<size; ++y)
		{
			if (block.isBoxSet(x, y))
			{
				if (getFieldCellAbs(block.x+x+bx+PLAYFIELD_WALL_SIZE, block.y+y+by) !== PLAYFIELD_EMPTY_CELL)
				{
					return false;
				}
			}
		}
	}
	return true;
}

var newBlockAdded = false;

function gameLoop()
{
	currentBlock.y++;
	if (!isRoomForBlock(currentBlock))
	{
		if (currentBlock.y <= currentBlock.getShapeSize()+1)
		{
			log("Game Over!");
			return;
		}
		
		// Add currentBlock to playfield
		var size = currentBlock.getShapeSize();
		var bx = currentBlock.getOffsetX();
		var by = currentBlock.getOffsetY();
		
		for (var x=0; x<size; ++x)
		{
			for (var y=0; y<size; ++y)
			{
				if (currentBlock.isBoxSet(x, y))
				{
					setFieldCellAbs(currentBlock.x+x+bx+PLAYFIELD_WALL_SIZE, currentBlock.y-1+y+by, currentBlock.color);
				}
			}
		}

		// Set current block back to starting point, waiting for next drop
		// TODO do some initBlock function to do this stuff in one place
		currentBlock.y=currentBlock.getShapeSize();
		currentBlock.x=PLAYFIELD_SIZE_X/2;
		currentBlock.futureX=PLAYFIELD_SIZE_X/2;
		currentBlock.rotate=0;
		currentBlock.futureRotate=0;
		moveQueue = new Array(); // Clear queue (TODO check wether this best way to do it) for next block.

		// get next block randomly
		currentBlock = blockArray[Math.floor(Math.random() * blockArray.length)];
		newBlockAdded = true;

		currentSpeed = DEFAULT_SPEED;
	}
	drawField();
	currentBlock.draw();
	
	if (newBlockAdded === true)
	{
		newBlockAdded = false;
		try
		{
			currentBlock.run();
		}
		catch(err)
		{
			log( err );
		}
	}
	
	setTimeout(gameLoop, currentSpeed);
}

$(document).ready(function() {
	initField();
	createBlocks();
	initCodeWindow();
	moveQueue = new Array();
	
	// get next (first) block randomly
	currentBlock = blockArray[Math.floor(Math.random() * blockArray.length)];
	newBlockAdded = true;

	gameLoop();
	
});

//-----------------