

export const TICK_MS = 40;           


export const DEFAULTS = {
    speed: 1.0,       
    activity: 1.0,   
    size: 1.0,         
    climbing: true,
    jumping: true,
    paused: false,
};

// ---- physics
export const PHYS = {
    walk: 24,          
    climb: 16,         
    crawl: 16,         
    gravity: 900,      
    maxFall: 650,      
    throwMax: 400,     
    edgeMargin: 40,    
    dragOffsetY: 110, 
    dragSway: 140,     
    moveTickMs: 40,    
};

// ---- apple feeding 
export const FEED = {
    dist: [130, 220],  
    dropHeight: 240,   
    grab: 22,        
    size: 11,          
    floorLift: 5,      
    bounce: 0.3,      
};

export const BEHAVIORS = [
    {name: 'stand',  weight: 34},
    {name: 'walk',   weight: 34},
    {name: 'look',   weight: 10},
    {name: 'sit',    weight: 9},
    {name: 'dangle', weight: 4, special: true, cooldown: 120},
    {name: 'sleep',  weight: 3, special: true, cooldown: 300},
    {name: 'draw',   weight: 3, special: true, cooldown: 300},
    {name: 'phone',  weight: 3, special: true, cooldown: 300},
    {name: 'climb',  weight: 4, special: true, cooldown: 240, needs: 'climbing'},
    {name: 'hop',    weight: 2, special: true, cooldown: 300, needs: 'jumping'},
];

export const PLANS = {
    stand:  [{a: 'stand', secs: [6, 16]}],
    walk:   [{a: 'walk', secs: [5, 12], dir: 'rand'}, {a: 'stand', secs: [1.5, 4]},
             {a: 'walk', secs: [5, 12], dir: 'rand'}],
    look:   [{a: 'stand', secs: [2, 4]}, {a: 'stand', secs: [2, 4], face: 'flip'},
             {a: 'stand', secs: [2, 4], face: 'flip'}],
    sit:    [{a: 'sit', secs: [14, 40]}],
    dangle: [{a: 'sitLegsUp', secs: [0.6, 0.6]}, {a: 'dangle', secs: [10, 30]},
             {a: 'sitLegsUp', secs: [0.6, 0.6]}],
    sleep:  [{a: 'sprawl', secs: [15, 35]}, {a: 'sit', secs: [4, 8]}],
    draw:   [{a: 'draw', secs: [10, 25]}, {a: 'sit', secs: [2, 5]}],
    phone:  [{a: 'phone', secs: [10, 25]}, {a: 'sit', secs: [2, 5]}],
    climb:  [{a: 'walk', to: 'wall', dir: 'nearestWall'}],
    hop:    [{a: 'stand', secs: [1, 2]}, {fn: 'hop'}],
    feed:   [{fn: 'feedStart'},                                 
             {a: 'stand', secs: [0.9, 0.9]},                      
             {a: 'walk', to: 'apple', dir: 'toApple', secs: [90, 90]},   
             {a: 'feedSquat', secs: [0.4, 0.4]},              
             {fn: 'feedGrab'},                                    
             {a: 'feedSquat', secs: [0.3, 0.3]},
             {a: 'feedUp', secs: [0.32, 0.32]},                 
             {a: 'feedRaise', secs: [0.68, 0.68]},                
             {a: 'feedEat', secs: [2.88, 2.88]},                  
             {a: 'feedLower', secs: [0.72, 0.72]},                
             {a: 'feedDone', secs: [0.88, 0.88]},                 
             {fn: 'feedEnd'}],                                   
};

// ---- climbing / jumping --
export const WALL = {
    topChance: 0.35,                   
    segPx: [60, 140],                 
    holdSecs: [1.5, 3.5],             
    endWeights: {down: 6, jump: 2, drop: 1},  
};
export const CEIL = {
    segments: [2, 3],                 
    crawlSecs: [4, 9],
    holdSecs: [1.5, 3],
    endWeights: {descend: 7, drop: 2},
};
export const JUMP = {
    wall: {vx: [160, 240], vy: [-260, -340]},
    hop: {vx: [110, 170], vy: [-330, -400]},
};

// ---- sprites -------.
const T = (list, size) => Object.fromEntries(list.split(' ').map(n => [n, size]));
export const SIZES = {
    ...T('10 5 5a 5ablink 6 7 8 9', [128, 154]),
    ...T('12 13 13blink 14', [128, 139]),
    ...T('23 23blink 24 25', [139, 128]),
    ...T('34 34blink 35 36 36a 36b 36c 37', [128, 146]),
};
export const frameSize = f => SIZES[f] ?? [128, 128];
export const frameFile = f => `img/shime${f}.png`;
export const EAT_FRAMES = ['E0', 'E1', 'E2', 'E3', 'E4a', 'E4b', 'E5a', 'E5b', 'E6a', 'E6b',
    'E1c', 'E2c', 'E7', 'E8', 'Apple'];       

// "name:ticks" tokens; ticks default to 8
const parse = (seq, def = 8) => seq.trim().split(/\s+/).map(t => {
    const [f, n] = t.split(':');
    return [f, (n ? +n : def) * TICK_MS];
});
const rep = (s, n) => Array(n).fill(s).join(' ');


const act = (surface, anchor, w, seq, extra = {}) => {
    const poses = parse(seq);
    return {surface, anchor, w, poses, total: poses.reduce((t, p) => t + p[1], 0), ...extra};
};

const BREATHE = '1 1a 1b 1a 1 1c 1d 1c';
const STRIDE = '3 3a 3b 3c 3d';

export const ACTIONS = {
    stand:     act('floor', [64, 128], 128, `${rep(BREATHE, 3)} 1blink 1a 1b 1a 1 1c 1d 1c`),
    walk:      act('floor', [64, 128], 128, `${rep(`2 ${STRIDE}`, 3)} 2blink ${STRIDE}`, {move: true, art: 'right'}),
    sit:       act('floor', [64, 128], 128, '11:75 11a'),
    sitLegsUp: act('floor', [64, 110], 128, '30:250'),
    dangle:    act('floor', [64, 110], 128, '31:75 31a'),
    phone:     act('floor', [64, 128], 128, '26:75 27'),
    draw:      act('floor', [64, 128], 128, `${rep('15 16 15 17', 3)} 15blink 16 15 17`),
    sprawl:    act('floor', [64, 128], 128, '20:30 21:30'),
    land:      act('floor', [64, 128], 128, '19:12 18:14', {art: 'right'}),
    grabWall:  act('wall', [36, 128], 128, '13:75 13blink'),
    climbWall: act('wall', [36, 128], 128, `${rep('14 14:7 12:7 13:7 13 13:7 12:7 14:7', 2)} 13blink 14:7 12:7 13:7`, {move: true}),
    grabCeiling: act('ceiling', [64, 36], 139, '23:75 23blink'),
    crawl:     act('ceiling', [64, 36], 139, `${rep('25:10 25 23 24 24:10 24 23 25', 2)} 25:10 25 23blink 24`, {move: true}),
    jump:      act('air', [64, 128], 128, '22:250'),
    fall:      act('air', [64, 128], 128, '4:250', {art: 'right'}),
    drag:      act('drag', [64, 128], 128, '5a:75'),          // frame replaced by dragFrame()

    // apple feeding (frames E* come from tools/make-eat-frames.py)
    feedSquat: act('floor', [64, 128], 128, '11:75'),
    feedUp:    act('floor', [64, 128], 128, 'E0:8'),
    feedRaise: act('floor', [64, 128], 128, 'E0:3 E1:4 E2:4 E3:6'),
    feedEat:   act('floor', [64, 128], 128, 'E3:6 E4a:5 E4b:6 E4a:5 E4b:6 E5a:5 E5b:6 E5a:5 E5b:6 E6a:5 E6b:6 E6a:5 E6b:6'),
    feedLower: act('floor', [64, 128], 128, 'E2c:4 E1c:4 E7:10'),
    feedDone:  act('floor', [64, 128], 128, 'E8:22'),
};

export function dragFrame(dx) {
    if (dx < -50) return '9';
    if (dx < -30) return '7';
    if (dx < -15) return '5';
    if (dx < 5) return '5a';
    if (dx < 30) return '6';
    if (dx < 50) return '8';
    return '10';
}