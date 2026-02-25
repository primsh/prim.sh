// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentToken
 * @notice Minimal ERC-20 for token.sh — inherits audited OZ v5 building blocks.
 *         Custom logic: configurable decimals, optional owner-only mint with supply cap.
 */
contract AgentToken is ERC20, ERC20Burnable, Ownable {
    uint8 private immutable _decimals;
    bool public mintable;
    uint256 public maxSupply;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        bool mintable_,
        uint256 maxSupply_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _decimals = decimals_;
        mintable = mintable_;
        maxSupply = maxSupply_;
        _mint(owner_, initialSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint additional tokens. Callable by owner only when mintable=true.
     *         If maxSupply > 0, minting is capped at maxSupply.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(mintable, "AgentToken: not mintable");
        if (maxSupply > 0) {
            require(totalSupply() + amount <= maxSupply, "AgentToken: exceeds max supply");
        }
        _mint(to, amount);
    }
}
