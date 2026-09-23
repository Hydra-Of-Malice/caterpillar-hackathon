"""CAT Sentinel simulator (agent A). Everything produced here is SIMULATED — not Caterpillar data.

- kinematics: physics-lite 10 Hz excavator model
- operators / cycles: operator archetypes and the human-like work-cycle controller
- injectors: labelled events (13-evaluation §5)
- generator: ShiftSimulator, load_scenario (config/scenarios/*.yaml)
- practice: generate_practice_session, EXERCISES (Practice Analyser input)
- run / replay: bus publishers; datasets: parquet training data
"""
