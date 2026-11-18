fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("Usage: verify-update ARCHIVE SIGNATURE VERSION");
        std::process::exit(2)
    }
    let result = (|| {
        let bytes = std::fs::read(&args[0]).map_err(|e| e.to_string())?;
        let signature = std::fs::read_to_string(&args[1]).map_err(|e| e.to_string())?;
        modu_lib::update_signature::verify(&bytes, &signature, &args[2])
    })();
    match result {
        Ok(()) => println!("Trusted signature and signed version verified."),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1)
        }
    }
}
